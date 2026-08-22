// Devis clients B2B — hors CDC, règles documentées (devis-rules.constants.ts).
// Machine : BROUILLON → ENVOYE → ACCEPTE|REFUSE ; BROUILLON|ENVOYE → ANNULE ;
// ACCEPTE → TRANSFORME (venteId optionnel). RBAC écriture : CRM, Resp. boutique,
// DAF, DG. Tests contre PostgreSQL réel (Testcontainers).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-devis-e2e';

interface DevisDto {
  id: string;
  numero: string;
  statut: string;
  montantTotal: string;
  boutiqueId: string | null;
  venteId: string | null;
  transitions: string[];
  client: { id: string };
  lignes: Array<{ designation: string; quantite: number }>;
}

describe('Devis clients B2B (e2e)', () => {
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
      data: { nomZone: 'Zone Devis' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Devis', adresse: 'Adr', zoneId: zone.id },
    });
    boutiqueId = boutique.id;

    await creerUtilisateur('devis-crm', 'RESPONSABLE_CRM', null, 1);
    await creerUtilisateur(
      'devis-respbout',
      'RESPONSABLE_BOUTIQUE',
      boutiqueId,
      3,
    );
    await creerUtilisateur('devis-daf', 'DAF', null, 1);
    await creerUtilisateur('devis-dg', 'DIRECTION_GENERALE', null, 0);
    await creerUtilisateur('devis-ctrl', 'CONTROLEUR_INTERNE', null, 1);
    await creerUtilisateur(
      'devis-caissier',
      'CAISSIER_BOUTIQUE',
      boutiqueId,
      4,
    );

    const client = await env.prisma.client.create({
      data: {
        nom: 'Client B2B Devis',
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

    tokens.crm = await login('devis-crm');
    tokens.respbout = await login('devis-respbout');
    tokens.daf = await login('devis-daf');
    tokens.dg = await login('devis-dg');
    tokens.ctrl = await login('devis-ctrl');
    tokens.caissier = await login('devis-caissier');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  describe('RBAC', () => {
    it('refuse (403) la lecture au caissier boutique', async () => {
      await request(app.getHttpServer())
        .get('/devis')
        .set(auth(tokens.caissier))
        .expect(403);
    });

    it('autorise la lecture au contrôleur (lecture seule)', async () => {
      await request(app.getHttpServer())
        .get('/devis')
        .set(auth(tokens.ctrl))
        .expect(200);
    });

    it('refuse (403) l’écriture au contrôleur', async () => {
      await request(app.getHttpServer())
        .post('/devis')
        .set(auth(tokens.ctrl))
        .send({
          clientId,
          lignes: [
            {
              designation: 'Interdit',
              quantite: 1,
              prixUnitaire: 1000,
            },
          ],
        })
        .expect(403);
    });
  });

  describe('Cycle de vie', () => {
    let devisId: string;

    it('crée un brouillon multi-lignes (CRM) et journalise', async () => {
      const response = await request(app.getHttpServer())
        .post('/devis')
        .set(auth(tokens.crm))
        .send({
          clientId,
          notes: 'Devis test e2e',
          lignes: [
            {
              designation: 'Lot A',
              quantite: 2,
              prixUnitaire: 5000,
              remise: 500,
            },
            {
              designation: 'Lot B',
              quantite: 1,
              prixUnitaire: 3000,
            },
          ],
        })
        .expect(201);

      const body = response.body as DevisDto;
      expect(body.statut).toBe('BROUILLON');
      expect(body.numero).toMatch(/^DEV-/);
      expect(Number(body.montantTotal)).toBe(2 * 5000 - 500 + 3000);
      expect(body.lignes).toHaveLength(2);
      expect(body.transitions).toEqual(
        expect.arrayContaining(['ENVOYE', 'ANNULE']),
      );
      devisId = body.id;

      const audit = await env.prisma.journalAudit.findFirst({
        where: { action: 'DEVIS_CLIENT_CREE', entiteId: devisId },
      });
      expect(audit).toBeTruthy();
    });

    it('rattache la boutique du responsable boutique à la création', async () => {
      const response = await request(app.getHttpServer())
        .post('/devis')
        .set(auth(tokens.respbout))
        .send({
          clientId,
          lignes: [
            { designation: 'Auto boutique', quantite: 1, prixUnitaire: 100 },
          ],
        })
        .expect(201);

      const body = response.body as DevisDto;
      expect(body.boutiqueId).toBe(boutiqueId);
    });

    it('modifie un brouillon puis refuse la modif après envoi', async () => {
      await request(app.getHttpServer())
        .put(`/devis/${devisId}`)
        .set(auth(tokens.daf))
        .send({
          notes: 'MAJ',
          lignes: [
            { designation: 'Lot A maj', quantite: 1, prixUnitaire: 10000 },
          ],
        })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/devis/${devisId}/statut`)
        .set(auth(tokens.crm))
        .send({ statut: 'ENVOYE' })
        .expect(200);

      await request(app.getHttpServer())
        .put(`/devis/${devisId}`)
        .set(auth(tokens.crm))
        .send({
          lignes: [{ designation: 'Trop tard', quantite: 1, prixUnitaire: 1 }],
        })
        .expect(400);
    });

    it('accepte le parcours ENVOYE → ACCEPTE → TRANSFORME sans venteId', async () => {
      await request(app.getHttpServer())
        .patch(`/devis/${devisId}/statut`)
        .set(auth(tokens.dg))
        .send({ statut: 'ACCEPTE' })
        .expect(200);

      const response = await request(app.getHttpServer())
        .patch(`/devis/${devisId}/statut`)
        .set(auth(tokens.crm))
        .send({ statut: 'TRANSFORME' })
        .expect(200);

      const body = response.body as DevisDto;
      expect(body.statut).toBe('TRANSFORME');
      expect(body.venteId).toBeNull();
      expect(body.transitions).toEqual([]);

      const audit = await env.prisma.journalAudit.findFirst({
        where: {
          action: 'DEVIS_CLIENT_TRANSITION',
          entiteId: devisId,
          details: { contains: 'ACCEPTE → TRANSFORME' },
        },
      });
      expect(audit).toBeTruthy();
    });

    it('refuse une transition interdite (400)', async () => {
      await request(app.getHttpServer())
        .patch(`/devis/${devisId}/statut`)
        .set(auth(tokens.crm))
        .send({ statut: 'ENVOYE' })
        .expect(400);
    });

    it('annule un brouillon depuis ENVOYE via nouveau devis', async () => {
      const cree = await request(app.getHttpServer())
        .post('/devis')
        .set(auth(tokens.crm))
        .send({
          clientId,
          lignes: [{ designation: 'À annuler', quantite: 1, prixUnitaire: 50 }],
        })
        .expect(201);
      const id = (cree.body as DevisDto).id;

      await request(app.getHttpServer())
        .patch(`/devis/${id}/statut`)
        .set(auth(tokens.crm))
        .send({ statut: 'ENVOYE' })
        .expect(200);

      const annule = await request(app.getHttpServer())
        .patch(`/devis/${id}/statut`)
        .set(auth(tokens.respbout))
        .send({ statut: 'ANNULE' })
        .expect(200);

      expect((annule.body as DevisDto).statut).toBe('ANNULE');
    });

    it('filtre la liste par clientId et statut', async () => {
      const response = await request(app.getHttpServer())
        .get(`/devis?clientId=${clientId}&statut=TRANSFORME`)
        .set(auth(tokens.ctrl))
        .expect(200);

      const list = response.body as DevisDto[];
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(list.every((d) => d.statut === 'TRANSFORME')).toBe(true);
      expect(list.every((d) => d.client.id === clientId)).toBe(true);
    });
  });
});
