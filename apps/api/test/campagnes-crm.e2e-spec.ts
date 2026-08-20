// Test d'intégration réel (zéro mock) — Campagnes CRM et tableau de bord
// client (§6.6 du cahier des charges) : ciblage par segment/niveau de
// fidélité + export CSV des contacts (pas d'envoi automatisé — décision
// validée avec l'utilisateur), et RBAC (crm-roles.constants.ts). Démarre un
// vrai PostgreSQL via Testcontainers (voir CLAUDE.md — zéro donnée mockée,
// y compris en test).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import type { RoleLibelle } from '@caisse-crm/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

interface LoginResponseBody {
  accessToken: string;
}
interface CampagneResponseBody {
  id: string;
  nom: string;
  segment: string | null;
  niveauFidelite: string | null;
  canal: string;
}
interface ContactResponseBody {
  clientId: string;
  nom: string;
  prenom: string;
  contact: string | null;
  pointsCumules: number;
}
interface TableauDeBordResponseBody {
  totalDepense: string;
  nombreAchats: number;
  dateDernierAchat: string | null;
  pointsCumules: number;
  niveauFidelite: string;
}

function body<T>(response: request.Response): T {
  return response.body as T;
}

describe('Campagnes CRM et tableau de bord client (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  const ROLES: RoleLibelle[] = [
    'DIRECTION_GENERALE',
    'DAF',
    'CAISSIER_CENTRAL',
    'CONTROLEUR_INTERNE',
    'SUPERVISEUR_ZONE',
    'RESPONSABLE_BOUTIQUE',
    'CAISSIER_BOUTIQUE',
    'RESPONSABLE_SI',
    'RESPONSABLE_CRM',
  ];

  const tokens: Record<string, string> = {};
  const userIds: Record<string, string> = {};

  const authHeader = (role: RoleLibelle) => `Bearer ${tokens[role]}`;

  beforeAll(async () => {
    await env.start();

    for (const libelle of ROLES) {
      const role = await env.prisma.role.create({
        data: { libelle, niveauHabilitation: 1 },
      });
      const login = `${libelle.toLowerCase()}.campagnes.test`;
      const utilisateur = await env.prisma.utilisateur.create({
        data: {
          login,
          passwordHash: await bcrypt.hash('MotDePasse!123', 10),
          nom: 'Test',
          prenom: libelle,
          actif: true,
          roleId: role.id,
        },
      });
      userIds[libelle] = utilisateur.id;
    }

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

    for (const libelle of ROLES) {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          login: `${libelle.toLowerCase()}.campagnes.test`,
          password: 'MotDePasse!123',
        })
        .expect(200);
      tokens[libelle] = body<LoginResponseBody>(response).accessToken;
    }
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  // ---------------------------------------------------------------------
  // Création de campagne — RESPONSABLE_CRM only (crm-roles.constants.ts)
  // ---------------------------------------------------------------------

  describe('Création de campagne', () => {
    it('autorise le Responsable CRM à créer une campagne et journalise l’action', async () => {
      const response = await request(app.getHttpServer())
        .post('/crm/campagnes')
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .send({
          nom: 'Promo VIP rentrée',
          message: 'Offre exclusive pour nos clients VIP',
          segment: 'VIP',
          canal: 'SMS',
        })
        .expect(201);

      const campagne = body<CampagneResponseBody>(response);
      expect(campagne.id).toEqual(expect.any(String));
      expect(campagne.segment).toBe('VIP');

      const entree = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'CampagneCrm',
          entiteId: campagne.id,
          action: 'CAMPAGNE_CRM_CREEE',
        },
      });
      expect(entree).not.toBeNull();
      expect(entree?.utilisateurId).toBe(userIds.RESPONSABLE_CRM);
    });

    it.each<RoleLibelle>([
      'DIRECTION_GENERALE',
      'DAF',
      'CAISSIER_CENTRAL',
      'CONTROLEUR_INTERNE',
      'SUPERVISEUR_ZONE',
      'RESPONSABLE_BOUTIQUE',
      'CAISSIER_BOUTIQUE',
      'RESPONSABLE_SI',
    ])(
      'refuse explicitement (403) la création de campagne au rôle %s',
      async (role) => {
        await request(app.getHttpServer())
          .post('/crm/campagnes')
          .set('Authorization', authHeader(role))
          .send({ nom: 'Campagne test', message: 'msg', canal: 'SMS' })
          .expect(403);
      },
    );
  });

  // ---------------------------------------------------------------------
  // Ciblage et export CSV des contacts
  // ---------------------------------------------------------------------

  describe('Ciblage et export CSV des contacts', () => {
    let campagneVipId: string;
    let campagneOrId: string;

    beforeAll(async () => {
      const clientsData: {
        nom: string;
        prenom: string;
        segment: 'NOUVEAU' | 'REGULIER' | 'VIP';
        niveau: 'BRONZE' | 'ARGENT' | 'OR';
        points: number;
        contact: string;
      }[] = [
        {
          nom: 'Traoré',
          prenom: 'Awa',
          segment: 'VIP',
          niveau: 'OR',
          points: 3000,
          contact: '0700000010',
        },
        {
          nom: 'Koné',
          prenom: 'Ibrahim',
          segment: 'VIP',
          niveau: 'ARGENT',
          points: 800,
          contact: '0700000011',
        },
        {
          nom: 'Diarra',
          prenom: 'Fatou',
          segment: 'NOUVEAU',
          niveau: 'OR',
          points: 3000,
          contact: '0700000012',
        },
        {
          nom: 'Sanogo',
          prenom: 'Moussa',
          segment: 'REGULIER',
          niveau: 'BRONZE',
          points: 50,
          contact: '0700000013',
        },
      ];

      for (const c of clientsData) {
        const client = await env.prisma.client.create({
          data: {
            nom: c.nom,
            prenom: c.prenom,
            segment: c.segment,
            contact: c.contact,
          },
        });
        await env.prisma.fidelite.create({
          data: {
            clientId: client.id,
            pointsCumules: c.points,
            niveau: c.niveau,
          },
        });
      }

      const campagneVip = await env.prisma.campagneCrm.create({
        data: {
          nom: 'Campagne segment VIP',
          message: 'Offre VIP',
          segment: 'VIP',
          canal: 'SMS',
          createdById: userIds.RESPONSABLE_CRM,
        },
      });
      campagneVipId = campagneVip.id;

      const campagneOr = await env.prisma.campagneCrm.create({
        data: {
          nom: 'Campagne palier OR',
          message: 'Offre OR',
          niveauFidelite: 'OR',
          canal: 'WHATSAPP',
          createdById: userIds.RESPONSABLE_CRM,
        },
      });
      campagneOrId = campagneOr.id;
    });

    it('résout les contacts ciblés par segment (VIP uniquement)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/crm/campagnes/${campagneVipId}/contacts`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);

      const contacts = body<ContactResponseBody[]>(response);
      const noms = contacts.map((c) => c.nom).sort();
      expect(noms).toEqual(['Koné', 'Traoré']);
    });

    it('résout les contacts ciblés par palier de fidélité (OR uniquement)', async () => {
      const response = await request(app.getHttpServer())
        .get(`/crm/campagnes/${campagneOrId}/contacts`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);

      const contacts = body<ContactResponseBody[]>(response);
      const noms = contacts.map((c) => c.nom).sort();
      expect(noms).toEqual(['Diarra', 'Traoré']);
    });

    it('exporte un CSV bien formé avec les bons contacts et en-têtes', async () => {
      const response = await request(app.getHttpServer())
        .get(`/crm/campagnes/${campagneVipId}/contacts/export.csv`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      const lignes = response.text.trim().split('\r\n');
      expect(lignes[0]).toBe('ID client,Nom,Prénom,Contact,Points fidélité');
      // en-tête + 2 contacts VIP
      expect(lignes).toHaveLength(3);
      expect(response.text).toContain('Traoré');
      expect(response.text).toContain('Koné');
    });

    it('refuse explicitement (403) l’export CSV à un rôle non habilité (RESPONSABLE_SI)', async () => {
      await request(app.getHttpServer())
        .get(`/crm/campagnes/${campagneVipId}/contacts/export.csv`)
        .set('Authorization', authHeader('RESPONSABLE_SI'))
        .expect(403);
    });

    it('renvoie 404 pour une campagne inexistante (détail, contacts, export)', async () => {
      const idInexistant = '00000000-0000-0000-0000-000000000000';
      await request(app.getHttpServer())
        .get(`/crm/campagnes/${idInexistant}`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(404);
      await request(app.getHttpServer())
        .get(`/crm/campagnes/${idInexistant}/contacts`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(404);
    });

    it('liste les campagnes pour un rôle de lecture réseau', async () => {
      const response = await request(app.getHttpServer())
        .get('/crm/campagnes')
        .set('Authorization', authHeader('DIRECTION_GENERALE'))
        .expect(200);

      const campagnes = body<CampagneResponseBody[]>(response);
      expect(campagnes.length).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------
  // Tableau de bord client (§6.6)
  // ---------------------------------------------------------------------

  describe('Tableau de bord client', () => {
    let clientId: string;
    let clientSansAchatId: string;
    let caisseId: string;
    let sessionCaisseId: string;

    beforeAll(async () => {
      const zone = await env.prisma.zone.create({
        data: { nomZone: 'Zone Test Tableau de bord' },
      });
      const boutique = await env.prisma.boutique.create({
        data: {
          nom: 'Boutique Test Tableau de bord',
          adresse: 'Marché des Accessoires',
          zoneId: zone.id,
        },
      });
      const caisse = await env.prisma.caisse.create({
        data: { type: 'AUXILIAIRE', boutiqueId: boutique.id },
      });
      caisseId = caisse.id;

      const roleCaissierBoutique = await env.prisma.role.upsert({
        where: { libelle: 'CAISSIER_BOUTIQUE' },
        update: {},
        create: { libelle: 'CAISSIER_BOUTIQUE', niveauHabilitation: 4 },
      });
      const caissierSession = await env.prisma.utilisateur.create({
        data: {
          login: 'caissier-session-tdb.test',
          passwordHash: await bcrypt.hash('MotDePasse!123', 10),
          nom: 'Test',
          prenom: 'CaissierSession',
          actif: true,
          roleId: roleCaissierBoutique.id,
          boutiqueId: boutique.id,
        },
      });
      const temoinSession = await env.prisma.utilisateur.create({
        data: {
          login: 'temoin-session-tdb.test',
          passwordHash: await bcrypt.hash('MotDePasse!123', 10),
          nom: 'Test',
          prenom: 'TemoinSession',
          actif: true,
          roleId: roleCaissierBoutique.id,
          boutiqueId: boutique.id,
        },
      });
      const sessionCaisse = await env.prisma.sessionCaisse.create({
        data: {
          caisseId,
          fondInitial: '0.00',
          ouvertureUtilisateurId: caissierSession.id,
          ouvertureTemoinId: temoinSession.id,
        },
      });
      sessionCaisseId = sessionCaisse.id;

      const client = await env.prisma.client.create({
        data: { nom: 'Keita', prenom: 'Seydou' },
      });
      clientId = client.id;
      await env.prisma.fidelite.create({
        data: { clientId, pointsCumules: 250, niveau: 'ARGENT' },
      });

      await env.prisma.vente.create({
        data: {
          montantTotal: '15000.00',
          caisseId,
          clientId,
          modePaiement: 'ESPECES',
          sessionCaisseId,
          dateVente: new Date('2026-01-10T10:00:00Z'),
        },
      });
      await env.prisma.vente.create({
        data: {
          montantTotal: '5000.00',
          caisseId,
          clientId,
          modePaiement: 'CARTE',
          sessionCaisseId,
          dateVente: new Date('2026-02-15T10:00:00Z'),
        },
      });

      const clientSansAchat = await env.prisma.client.create({
        data: { nom: 'Diallo', prenom: 'Ramata' },
      });
      clientSansAchatId = clientSansAchat.id;
    });

    it('agrège correctement total dépensé, nombre d’achats, dernier achat et fidélité', async () => {
      const response = await request(app.getHttpServer())
        .get(`/crm/clients/${clientId}/tableau-de-bord`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);

      const tdb = body<TableauDeBordResponseBody>(response);
      expect(tdb.totalDepense).toBe('20000.00');
      expect(tdb.nombreAchats).toBe(2);
      expect(new Date(tdb.dateDernierAchat as string).toISOString()).toBe(
        new Date('2026-02-15T10:00:00Z').toISOString(),
      );
      expect(tdb.pointsCumules).toBe(250);
      expect(tdb.niveauFidelite).toBe('ARGENT');
    });

    it('renvoie un tableau de bord vide (zéro) pour un client sans achat', async () => {
      const response = await request(app.getHttpServer())
        .get(`/crm/clients/${clientSansAchatId}/tableau-de-bord`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);

      const tdb = body<TableauDeBordResponseBody>(response);
      expect(tdb.totalDepense).toBe('0.00');
      expect(tdb.nombreAchats).toBe(0);
      expect(tdb.dateDernierAchat).toBeNull();
    });

    it('refuse explicitement (403) l’accès au tableau de bord à RESPONSABLE_SI', async () => {
      await request(app.getHttpServer())
        .get(`/crm/clients/${clientId}/tableau-de-bord`)
        .set('Authorization', authHeader('RESPONSABLE_SI'))
        .expect(403);
    });

    it('renvoie 404 pour un client inexistant', async () => {
      await request(app.getHttpServer())
        .get(
          '/crm/clients/00000000-0000-0000-0000-000000000000/tableau-de-bord',
        )
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(404);
    });
  });
});
