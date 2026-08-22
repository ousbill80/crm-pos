// Tests d'intégration réels (zéro mock) — impression d'étiquettes
// code-barres en lot depuis le Catalogue (fonctionnalité clarifiée avec
// l'utilisateur : support rouleau/A4 au choix, contenu au choix, génération
// automatique d'un code interne Code128 si codeBarres est absent — voir
// apps/api/src/produits/produits.service.ts#preparerEtiquettes).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-etiquettes-e2e';

describe('Impression d’étiquettes code-barres — Catalogue (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  const tokens: Record<string, string> = {};
  let boutiqueId: string;
  let produitAvecEanId: string;
  let produitSansCodeId: string;

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
      data: { nomZone: 'Zone Étiquettes' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Étiquettes', adresse: 'Adr', zoneId: zone.id },
    });
    boutiqueId = boutique.id;

    await creerUtilisateur('etq-respsi', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('etq-caissier', 'CAISSIER_BOUTIQUE', boutique.id, 4);

    const produitAvecEan = await env.prisma.produit.create({
      data: {
        designation: 'Écouteurs filaires',
        reference: 'ETQ-EAN-1',
        prixUnitaire: 3500,
        stock: 10,
        codeBarres: '2012345678903',
      },
    });
    produitAvecEanId = produitAvecEan.id;

    const produitSansCode = await env.prisma.produit.create({
      data: {
        designation: 'Support téléphone',
        reference: 'ETQ-SANS-1',
        prixUnitaire: 4000,
        stock: 10,
      },
    });
    produitSansCodeId = produitSansCode.id;

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

    tokens.respsi = await login('etq-respsi');
    tokens.caissier = await login('etq-caissier');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  function dtoBase(overrides: Record<string, unknown> = {}) {
    return {
      articles: [{ produitId: produitAvecEanId, quantite: 2 }],
      format: 'ROULEAU',
      afficherNom: false,
      afficherBoutique: false,
      afficherReference: false,
      ...overrides,
    };
  }

  it('refuse (403) un rôle hors ROLES_CATALOGUE_ECRITURE (CAISSIER_BOUTIQUE)', () => {
    return request(app.getHttpServer())
      .post('/produits/etiquettes/pdf')
      .set(auth(tokens.caissier))
      .send(dtoBase())
      .expect(403);
  });

  it('génère un PDF (rouleau) pour un article avec EAN déjà saisi, sans le modifier', async () => {
    const response = await request(app.getHttpServer())
      .post('/produits/etiquettes/pdf')
      .set(auth(tokens.respsi))
      .send(dtoBase())
      .expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(
      Buffer.isBuffer(response.body) ? response.body.length : 0,
    ).toBeGreaterThan(0);

    const produit = await env.prisma.produit.findUniqueOrThrow({
      where: { id: produitAvecEanId },
    });
    expect(produit.codeBarres).toBe('2012345678903');
    expect(produit.codeBarresGenere).toBe(false);
  });

  it('génère automatiquement un code interne pour un article sans codeBarres et journalise', async () => {
    const response = await request(app.getHttpServer())
      .post('/produits/etiquettes/pdf')
      .set(auth(tokens.respsi))
      .send(
        dtoBase({
          articles: [{ produitId: produitSansCodeId, quantite: 1 }],
          format: 'PLANCHE_A4',
        }),
      )
      .expect(200);

    expect(response.headers['content-type']).toBe('application/pdf');
    expect(
      Buffer.isBuffer(response.body) ? response.body.length : 0,
    ).toBeGreaterThan(0);

    const produit = await env.prisma.produit.findUniqueOrThrow({
      where: { id: produitSansCodeId },
    });
    expect(produit.codeBarres).not.toBeNull();
    expect(produit.codeBarresGenere).toBe(true);

    const audit = await env.prisma.journalAudit.findFirst({
      where: {
        entite: 'Produit',
        entiteId: produitSansCodeId,
        action: 'PRODUIT_CODE_BARRES_GENERE',
      },
    });
    expect(audit).not.toBeNull();

    const auditLot = await env.prisma.journalAudit.findFirst({
      where: {
        action: 'ETIQUETTES_IMPRESSION_LOT',
        entiteId: produitSansCodeId,
      },
    });
    expect(auditLot).not.toBeNull();
  });

  it('accepte une planche A4 avec affichage boutique quand boutiqueId est fourni', async () => {
    const response = await request(app.getHttpServer())
      .post('/produits/etiquettes/pdf')
      .set(auth(tokens.respsi))
      .send(
        dtoBase({
          format: 'PLANCHE_A4',
          afficherNom: true,
          afficherBoutique: true,
          afficherReference: true,
          boutiqueId,
        }),
      )
      .expect(200);
    expect(response.headers['content-type']).toBe('application/pdf');
  });

  it('refuse (400) afficherBoutique=true sans boutiqueId', () => {
    return request(app.getHttpServer())
      .post('/produits/etiquettes/pdf')
      .set(auth(tokens.respsi))
      .send(dtoBase({ afficherBoutique: true }))
      .expect(400);
  });

  it('refuse (400) une quantité <= 0', () => {
    return request(app.getHttpServer())
      .post('/produits/etiquettes/pdf')
      .set(auth(tokens.respsi))
      .send(
        dtoBase({ articles: [{ produitId: produitAvecEanId, quantite: 0 }] }),
      )
      .expect(400);
  });

  it('refuse (400) un total d’étiquettes au-delà du plafond de 1000', () => {
    return request(app.getHttpServer())
      .post('/produits/etiquettes/pdf')
      .set(auth(tokens.respsi))
      .send(
        dtoBase({
          articles: [
            { produitId: produitAvecEanId, quantite: 500 },
            { produitId: produitSansCodeId, quantite: 501 },
          ],
        }),
      )
      .expect(400);
  });

  it('renvoie 404 si un produit demandé est introuvable', () => {
    return request(app.getHttpServer())
      .post('/produits/etiquettes/pdf')
      .set(auth(tokens.respsi))
      .send(
        dtoBase({
          articles: [
            { produitId: '00000000-0000-0000-0000-000000000000', quantite: 1 },
          ],
        }),
      )
      .expect(404);
  });
});
