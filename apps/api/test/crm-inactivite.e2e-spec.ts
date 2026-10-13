// Test d'intégration réel (zéro mock) — segmentation CRM comportementale
// additive (§6.6) : récence d'achat + montant cumulé + seuil d'inactivité
// paramétrable, exposés pour le ciblage des campagnes. N'altère jamais le
// calcul de segment VIP/REGULIER/NOUVEAU existant (recalculerSegment).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { TypeCaisse } from '@prisma/client';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

interface ClientDto {
  id: string;
  derniereDateAchat: string | null;
  montantTotalAchats: string;
  estInactif: boolean;
}

interface SessionCaisseDto {
  id: string;
}

interface VenteDto {
  id: string;
  lignes: { id: string }[];
}

process.env.JWT_SECRET ??= 'test-secret-crm-inactivite-e2e';

function moisAvant(n: number): Date {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

describe('CRM — récence/inactivité comportementale §6.6 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutiqueId: string;
  let entrepotId: string;
  let caisseTiroirId: string;
  let produitId: string;

  const tokens: Record<string, string> = {};

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function login(loginValue: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: MOT_DE_PASSE })
      .expect(200);
    const body = response.body as { accessToken: string };
    return body.accessToken;
  }

  async function creerUtilisateur(
    loginValue: string,
    roleLibelle: string,
    boutiqueIdCible: string | null,
  ): Promise<string> {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation: 1 },
    });
    const utilisateur = await env.prisma.utilisateur.create({
      data: {
        login: loginValue,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'Test',
        prenom: loginValue,
        actif: true,
        roleId: role.id,
        boutiqueId: boutiqueIdCible,
      },
    });
    return utilisateur.id;
  }

  async function getClient(id: string, token: string): Promise<ClientDto> {
    const response = await request(app.getHttpServer())
      .get(`/crm/clients/${id}`)
      .set(auth(token))
      .expect(200);
    return response.body as ClientDto;
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({
      data: { nomZone: 'Zone CRM' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique CRM', adresse: 'Adresse', zoneId: zone.id },
    });
    boutiqueId = boutique.id;

    const entrepot = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal CRM',
        code: 'PRINCIPAL-CRM',
        type: 'PRINCIPAL',
        boutiqueId,
      },
    });
    entrepotId = entrepot.id;

    await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId, libelle: 'Magasin CRM' },
    });
    const tiroir = await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.TIROIR,
        boutiqueId,
        code: 'T01',
        libelle: 'Tiroir CRM',
        actif: true,
        ordreAffichage: 1,
      },
    });
    caisseTiroirId = tiroir.id;

    const produit = await env.prisma.produit.create({
      data: { designation: 'Chargeur', prixUnitaire: '1000.00', stock: 50 },
    });
    produitId = produit.id;
    await env.prisma.stockQuant.create({
      data: { produitId, entrepotId, quantite: 50 },
    });

    await creerUtilisateur('caissier-crm', 'CAISSIER_BOUTIQUE', boutiqueId);
    await creerUtilisateur('resp-crm', 'RESPONSABLE_BOUTIQUE', boutiqueId);
    await creerUtilisateur('crm-admin', 'RESPONSABLE_CRM', null);

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(env.prisma)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    tokens.caissierCrm = await login('caissier-crm');
    tokens.crmAdmin = await login('crm-admin');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it(
    'met à jour derniereDateAchat et montantTotalAchats à la vente, et ' +
      'décrémente montantTotalAchats (sans toucher la récence) au retour',
    async () => {
      const clientCree = await request(app.getHttpServer())
        .post('/crm/clients')
        .set(auth(tokens.crmAdmin))
        .send({
          nom: 'Diallo',
          prenom: 'Fatou',
          contact: '0700000010',
          consentementMarketing: true,
        })
        .expect(201);
      const clientId = (clientCree.body as { id: string }).id;

      const avantAchat = await getClient(clientId, tokens.crmAdmin);
      expect(avantAchat.derniereDateAchat).toBeNull();
      expect(Number(avantAchat.montantTotalAchats)).toBe(0);
      expect(avantAchat.estInactif).toBe(false);

      const ouverture = await request(app.getHttpServer())
        .post('/ventes/sessions')
        .set(auth(tokens.caissierCrm))
        .send({
          caisseId: caisseTiroirId,
          fondInitial: 0,
          temoinLogin: 'resp-crm',
          temoinPassword: MOT_DE_PASSE,
        })
        .expect(201);
      const sessionId = (ouverture.body as SessionCaisseDto).id;

      const vente = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierCrm))
        .send({
          lignes: [{ produitId, quantite: 2 }],
          modePaiement: 'ESPECES',
          clientId,
        })
        .expect(201);
      const venteBody = vente.body as VenteDto;

      const apresAchat = await getClient(clientId, tokens.crmAdmin);
      expect(apresAchat.derniereDateAchat).not.toBeNull();
      expect(Number(apresAchat.montantTotalAchats)).toBe(2000);
      expect(apresAchat.estInactif).toBe(false);

      await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/retours`)
        .set(auth(tokens.caissierCrm))
        .send({ ligneVenteId: venteBody.lignes[0].id, quantite: 1 })
        .expect(201);

      const apresRetour = await getClient(clientId, tokens.crmAdmin);
      expect(Number(apresRetour.montantTotalAchats)).toBe(1000);
      // La récence n'est pas revue à la baisse par un retour.
      expect(apresRetour.derniereDateAchat).toBe(apresAchat.derniereDateAchat);
    },
  );

  it(
    'calcule estInactif selon Societe.seuilInactiviteMois (défaut 6 mois), ' +
      'jamais vrai pour un client qui n’a jamais acheté',
    async () => {
      const inactif7mois = await env.prisma.client.create({
        data: {
          nom: 'Inactif7Mois',
          prenom: 'Client',
          consentementMarketing: true,
          contact: '0700000011',
          derniereDateAchat: moisAvant(7),
          montantTotalAchats: '500.00',
        },
      });
      const inactif4mois = await env.prisma.client.create({
        data: {
          nom: 'Inactif4Mois',
          prenom: 'Client',
          consentementMarketing: true,
          contact: '0700000012',
          derniereDateAchat: moisAvant(4),
          montantTotalAchats: '300.00',
        },
      });
      const jamaisAchete = await env.prisma.client.create({
        data: {
          nom: 'JamaisAchete',
          prenom: 'Client',
          consentementMarketing: true,
          contact: '0700000013',
        },
      });

      const r7 = await getClient(inactif7mois.id, tokens.crmAdmin);
      expect(r7.estInactif).toBe(true);
      const r4 = await getClient(inactif4mois.id, tokens.crmAdmin);
      expect(r4.estInactif).toBe(false);
      const rJamais = await getClient(jamaisAchete.id, tokens.crmAdmin);
      expect(rJamais.estInactif).toBe(false);

      const liste6 = await request(app.getHttpServer())
        .get('/crm/clients')
        .query({ inactifDepuisMois: 6 })
        .set(auth(tokens.crmAdmin))
        .expect(200);
      const idsListe6 = (liste6.body as ClientDto[]).map((c) => c.id);
      expect(idsListe6).toContain(inactif7mois.id);
      expect(idsListe6).not.toContain(inactif4mois.id);
      expect(idsListe6).not.toContain(jamaisAchete.id);

      await request(app.getHttpServer())
        .patch('/crm/parametres')
        .set(auth(tokens.crmAdmin))
        .send({ seuilInactiviteMois: 3 })
        .expect(200);

      const r4ApresBaisseSeuil = await getClient(
        inactif4mois.id,
        tokens.crmAdmin,
      );
      expect(r4ApresBaisseSeuil.estInactif).toBe(true);

      await request(app.getHttpServer())
        .patch('/crm/parametres')
        .set(auth(tokens.crmAdmin))
        .send({ seuilInactiviteMois: 6 })
        .expect(200);
    },
  );

  it('refuse (403) la modification des paramètres CRM par un caissier boutique', async () => {
    await request(app.getHttpServer())
      .patch('/crm/parametres')
      .set(auth(tokens.caissierCrm))
      .send({ seuilInactiviteMois: 2 })
      .expect(403);
  });

  it(
    'cible une campagne par inactifDepuisMois, cumulable avec le ' +
      'consentement marketing/contact déjà requis',
    async () => {
      const cibleInactive = await env.prisma.client.create({
        data: {
          nom: 'CibleCampagne',
          prenom: 'Inactive',
          consentementMarketing: true,
          contact: '0700000020',
          derniereDateAchat: moisAvant(8),
        },
      });
      const nonCibleRecente = await env.prisma.client.create({
        data: {
          nom: 'NonCibleRecente',
          prenom: 'Client',
          consentementMarketing: true,
          contact: '0700000021',
          derniereDateAchat: moisAvant(1),
        },
      });
      const nonCibleSansConsentement = await env.prisma.client.create({
        data: {
          nom: 'NonCibleSansConsentement',
          prenom: 'Client',
          consentementMarketing: false,
          contact: '0700000022',
          derniereDateAchat: moisAvant(8),
        },
      });

      const campagne = await request(app.getHttpServer())
        .post('/crm/campagnes')
        .set(auth(tokens.crmAdmin))
        .send({
          nom: 'Relance inactifs',
          message: 'On vous a manqué !',
          canal: 'SMS',
          inactifDepuisMois: 6,
        })
        .expect(201);
      const campagneId = (campagne.body as { id: string }).id;

      const contacts = await request(app.getHttpServer())
        .get(`/crm/campagnes/${campagneId}/contacts`)
        .set(auth(tokens.crmAdmin))
        .expect(200);
      const idsContacts = (contacts.body as { clientId: string }[]).map(
        (c) => c.clientId,
      );
      expect(idsContacts).toContain(cibleInactive.id);
      expect(idsContacts).not.toContain(nonCibleRecente.id);
      expect(idsContacts).not.toContain(nonCibleSansConsentement.id);
    },
  );
});
