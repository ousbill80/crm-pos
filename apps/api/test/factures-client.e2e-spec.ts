// Factures clients B2B — hors CDC, règles documentées
// (facture-client-rules.constants.ts).
// Machine : BROUILLON → EMISE | ANNULEE. EMISE immuable.
// Ticket POS / commande web ≠ facture. RBAC : caissier boutique 403.
// Tests contre PostgreSQL réel (Testcontainers).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-facture-client-e2e';

interface FactureDto {
  id: string;
  numero: string;
  statut: string;
  montantHt: string;
  montantTva: string;
  montantTtc: string;
  montantPaye: string;
  solde: string;
  devisId: string | null;
  transitions: string[];
  client: { id: string };
  lignes: Array<{ designation: string; montantTtc: string }>;
}

describe('Factures clients B2B (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  let boutiqueId: string;
  let clientId: string;

  async function login(loginValue: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: MOT_DE_PASSE })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function creerUtilisateur(
    loginValue: string,
    roleLibelle: string,
    boutique: string | null,
    niveauHabilitation: number,
  ): Promise<string> {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation },
    });
    const utilisateur = await env.prisma.utilisateur.create({
      data: {
        login: loginValue,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'Test',
        prenom: loginValue,
        actif: true,
        roleId: role.id,
        boutiqueId: boutique,
      },
    });
    return utilisateur.id;
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({
      data: { nomZone: 'Zone Facture' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Facture', adresse: 'Adr', zoneId: zone.id },
    });
    boutiqueId = boutique.id;

    await creerUtilisateur('fac-crm', 'RESPONSABLE_CRM', null, 1);
    await creerUtilisateur(
      'fac-respbout',
      'RESPONSABLE_BOUTIQUE',
      boutiqueId,
      3,
    );
    await creerUtilisateur('fac-daf', 'DAF', null, 1);
    await creerUtilisateur('fac-raf', 'RAF_COMPTABLE', null, 1);
    await creerUtilisateur('fac-ctrl', 'CONTROLEUR_INTERNE', null, 1);
    await creerUtilisateur('fac-caissier', 'CAISSIER_BOUTIQUE', boutiqueId, 4);

    const client = await env.prisma.client.create({
      data: {
        nom: 'Client B2B Facture',
        typeClient: 'MORALE',
        segment: 'NOUVEAU',
        consentementMarketing: false,
      },
    });
    clientId = client.id;

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

    tokens.crm = await login('fac-crm');
    tokens.respbout = await login('fac-respbout');
    tokens.daf = await login('fac-daf');
    tokens.raf = await login('fac-raf');
    tokens.ctrl = await login('fac-ctrl');
    tokens.caissier = await login('fac-caissier');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  describe('RBAC', () => {
    it('refuse (403) la lecture au caissier boutique', async () => {
      await request(app.getHttpServer())
        .get('/factures-client')
        .set(auth(tokens.caissier))
        .expect(403);
    });

    it('autorise la lecture au contrôleur', async () => {
      await request(app.getHttpServer())
        .get('/factures-client')
        .set(auth(tokens.ctrl))
        .expect(200);
    });

    it('refuse (403) l’écriture au contrôleur', async () => {
      await request(app.getHttpServer())
        .post('/factures-client')
        .set(auth(tokens.ctrl))
        .send({
          clientId,
          lignes: [
            { designation: 'Interdit', quantite: 1, prixUnitaire: 1000 },
          ],
        })
        .expect(403);
    });
  });

  describe('Cycle de vie', () => {
    let factureId: string;
    let devisId: string;

    it('crée un brouillon HT+TVA (CRM) et journalise', async () => {
      const response = await request(app.getHttpServer())
        .post('/factures-client')
        .set(auth(tokens.crm))
        .send({
          clientId,
          notes: 'Facture test e2e',
          lignes: [
            {
              designation: 'Prestation B2B',
              quantite: 1,
              prixUnitaire: 1000,
              tauxTva: 18,
            },
          ],
        })
        .expect(201);

      const body = response.body as FactureDto;
      expect(body.statut).toBe('BROUILLON');
      expect(body.numero).toMatch(/^FAC-/);
      expect(Number(body.montantHt)).toBe(1000);
      expect(Number(body.montantTva)).toBe(180);
      expect(Number(body.montantTtc)).toBe(1180);
      expect(body.transitions).toEqual(
        expect.arrayContaining(['EMISE', 'ANNULEE']),
      );
      factureId = body.id;

      const audit = await env.prisma.journalAudit.findFirst({
        where: { action: 'FACTURE_CLIENT_CREEE', entiteId: factureId },
      });
      expect(audit).toBeTruthy();
    });

    it('refuse la modification après émission et l’annulation d’une émise', async () => {
      await request(app.getHttpServer())
        .patch(`/factures-client/${factureId}/statut`)
        .set(auth(tokens.daf))
        .send({ statut: 'EMISE' })
        .expect(200);

      await request(app.getHttpServer())
        .put(`/factures-client/${factureId}`)
        .set(auth(tokens.crm))
        .send({ notes: 'trop tard' })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/factures-client/${factureId}/statut`)
        .set(auth(tokens.crm))
        .send({ statut: 'ANNULEE' })
        .expect(400);
    });

    it('refuse l’encaissement au CRM (403) et accepte RAF', async () => {
      await request(app.getHttpServer())
        .post(`/factures-client/${factureId}/encaissements`)
        .set(auth(tokens.crm))
        .send({ montant: 1180, mode: 'VIREMENT' })
        .expect(403);

      const response = await request(app.getHttpServer())
        .post(`/factures-client/${factureId}/encaissements`)
        .set(auth(tokens.raf))
        .send({ montant: 1180, mode: 'VIREMENT', reference: 'VIR-E2E' })
        .expect(201);

      const body = response.body as FactureDto;
      expect(Number(body.montantPaye)).toBe(1180);
      expect(Number(body.solde)).toBe(0);
    });

    it('refuse un encaissement supérieur au solde', async () => {
      await request(app.getHttpServer())
        .post(`/factures-client/${factureId}/encaissements`)
        .set(auth(tokens.raf))
        .send({ montant: 1, mode: 'ESPECES' })
        .expect(400);
    });

    it('génère le PDF d’une facture émise', async () => {
      const response = await request(app.getHttpServer())
        .get(`/factures-client/${factureId}/pdf`)
        .set(auth(tokens.ctrl))
        .expect(200);
      expect(response.headers['content-type']).toMatch(/pdf/);
    });

    it('transforme un devis accepté en facture (pas de ticket POS)', async () => {
      const created = await request(app.getHttpServer())
        .post('/devis')
        .set(auth(tokens.crm))
        .send({
          clientId,
          lignes: [
            { designation: 'Lot devis', quantite: 2, prixUnitaire: 500 },
          ],
        })
        .expect(201);
      devisId = (created.body as { id: string }).id;

      await request(app.getHttpServer())
        .patch(`/devis/${devisId}/statut`)
        .set(auth(tokens.crm))
        .send({ statut: 'ENVOYE' })
        .expect(200);
      await request(app.getHttpServer())
        .patch(`/devis/${devisId}/statut`)
        .set(auth(tokens.crm))
        .send({ statut: 'ACCEPTE' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .post('/factures-client')
        .set(auth(tokens.crm))
        .send({
          clientId,
          devisId,
          lignes: [
            { designation: 'Lot devis', quantite: 2, prixUnitaire: 500 },
          ],
        })
        .expect(201);

      const body = response.body as FactureDto;
      expect(body.devisId).toBe(devisId);
      expect(body.statut).toBe('BROUILLON');

      const second = await request(app.getHttpServer())
        .post('/factures-client')
        .set(auth(tokens.crm))
        .send({
          clientId,
          devisId,
          lignes: [{ designation: 'Doublon', quantite: 1, prixUnitaire: 1 }],
        })
        .expect(400);
      expect(JSON.stringify(second.body)).toMatch(/existe déjà/i);
    });
  });
});
