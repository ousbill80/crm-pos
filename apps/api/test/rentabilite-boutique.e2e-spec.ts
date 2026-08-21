// Tests d'intégration réels (zéro mock) — Rentabilité par boutique
// (reporting.service.ts: rentabiliteParBoutique). Démarre un vrai
// PostgreSQL via Testcontainers et exerce le flux réel encaisserVente /
// creerReception / creerRetour pour produire de vraies LigneVente avec
// coutUnitaire, plutôt que d'insérer des fixtures directement en base
// (ce que fait reporting.e2e-spec.ts, ce qui ne teste pas coutUnitaire).
//
// Prouve deux choses :
//  1. Le calcul CA net / CMV net / marge brute / taux de marge / valeur de
//     stock est mathématiquement correct.
//  2. LigneVente.coutUnitaire est un snapshot immuable du CMP : une
//     réception postérieure qui fait évoluer Produit.coutMoyenPondere ne
//     modifie jamais rétroactivement le coût déjà enregistré sur une vente
//     antérieure, ni la marge déjà calculée pour cette vente.
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

process.env.JWT_SECRET ??= 'test-secret-rentabilite-e2e';

interface DashboardDto {
  rentabiliteParBoutique: Array<{
    boutiqueId: string;
    nomBoutique: string;
    chiffreAffairesNet: string;
    coutDesVentes: string;
    margeBrute: string;
    tauxMarge: string;
    valeurStock: string;
  }>;
}

interface VenteDto {
  lignes: { id: string; produitId: string; quantite: number }[];
}

describe('Rentabilité par boutique — reporting.service.ts (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let caisse1Id: string;
  let entrepot1Id: string;
  let produitId: string;
  let fournisseurId: string;
  let ligneVenteId: string;

  const tokens: Record<string, string> = {};

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

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
    boutiqueId: string | null,
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
        boutiqueId,
      },
    });
    return utilisateur.id;
  }

  beforeAll(async () => {
    await env.start();

    const zoneA = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zoneA.id },
    });
    boutique1Id = boutique1.id;

    const entrepot1 = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B1',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique1Id,
      },
    });
    entrepot1Id = entrepot1.id;

    const caisse1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique1Id },
    });
    caisse1Id = caisse1.id;

    const produit = await env.prisma.produit.create({
      data: { designation: 'Produit rentabilité', prixUnitaire: '1000.00' },
    });
    produitId = produit.id;

    await creerUtilisateur('rent-si', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur(
      'rent-caissier-b1',
      'CAISSIER_BOUTIQUE',
      boutique1Id,
      4,
    );
    await creerUtilisateur(
      'rent-temoin-b1',
      'RESPONSABLE_BOUTIQUE',
      boutique1Id,
      3,
    );
    await creerUtilisateur('rent-daf', 'DAF', null, 1);

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

    tokens.si = await login('rent-si');
    tokens.caissierB1 = await login('rent-caissier-b1');
    tokens.daf = await login('rent-daf');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('construit le scénario réel : réception → vente → réception (CMP change) → retour', async () => {
    // Fournisseur
    const fournisseurResponse = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set(auth(tokens.si))
      .send({ nom: 'Fournisseur Test' })
      .expect(201);
    fournisseurId = (fournisseurResponse.body as { id: string }).id;

    // Réception 1 : 10 unités à 100 → CMP = 100
    await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.si))
      .send({
        produitId,
        quantite: 10,
        prixAchat: 100,
        entrepotId: entrepot1Id,
      })
      .expect(201);

    const produitApresReception1 = await env.prisma.produit.findUniqueOrThrow({
      where: { id: produitId },
    });
    expect(produitApresReception1.coutMoyenPondere.toFixed(2)).toBe('100.00');

    // Vente : 4 unités à 1000 (coutUnitaire snapshotté = 100)
    const session = await request(app.getHttpServer())
      .post('/ventes/sessions')
      .set(auth(tokens.caissierB1))
      .send({
        caisseId: caisse1Id,
        fondInitial: 0,
        temoinLogin: 'rent-temoin-b1',
      })
      .expect(201);
    const sessionId = (session.body as { id: string }).id;

    const venteResponse = await request(app.getHttpServer())
      .post(`/ventes/sessions/${sessionId}/ventes`)
      .set(auth(tokens.caissierB1))
      .send({ lignes: [{ produitId, quantite: 4 }], modePaiement: 'ESPECES' })
      .expect(201);
    const vente = venteResponse.body as VenteDto;
    ligneVenteId = vente.lignes[0].id;

    const ligneVenteApresVente = await env.prisma.ligneVente.findUniqueOrThrow({
      where: { id: ligneVenteId },
    });
    expect(ligneVenteApresVente.coutUnitaire?.toFixed(2)).toBe('100.00');

    // Réception 2 : 10 unités à 200 → CMP change (100*6 + 200*10) / 16 = 162.50
    await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.si))
      .send({
        produitId,
        quantite: 10,
        prixAchat: 200,
        entrepotId: entrepot1Id,
      })
      .expect(201);

    const produitApresReception2 = await env.prisma.produit.findUniqueOrThrow({
      where: { id: produitId },
    });
    expect(produitApresReception2.coutMoyenPondere.toFixed(2)).toBe('162.50');

    // Immutabilité : le coût de la vente déjà enregistrée ne bouge pas.
    const ligneVenteApresReception2 =
      await env.prisma.ligneVente.findUniqueOrThrow({
        where: { id: ligneVenteId },
      });
    expect(ligneVenteApresReception2.coutUnitaire?.toFixed(2)).toBe('100.00');

    // Retour : 1 unité sur la vente (rembourse 1000, coût associé = 100)
    await request(app.getHttpServer())
      .post(`/ventes/sessions/${sessionId}/retours`)
      .set(auth(tokens.caissierB1))
      .send({ ligneVenteId, quantite: 1 })
      .expect(201);
  }, 60_000);

  it('GET /reporting/dashboard — rentabiliteParBoutique calcule CA net / CMV net / marge / taux / valeur de stock', async () => {
    const response = await request(app.getHttpServer())
      .get('/reporting/dashboard')
      .set(auth(tokens.daf))
      .expect(200);

    const body = response.body as DashboardDto;
    const ligne = body.rentabiliteParBoutique.find(
      (r) => r.boutiqueId === boutique1Id,
    );
    expect(ligne).toBeDefined();

    // CA brut 4000 (4×1000) − 1000 (retour) = 3000
    expect(ligne?.chiffreAffairesNet).toBe('3000.00');
    // CMV brut 400 (4×100) − 100 (retour, coût figé à 100) = 300
    expect(ligne?.coutDesVentes).toBe('300.00');
    // Marge brute 3000 − 300 = 2700
    expect(ligne?.margeBrute).toBe('2700.00');
    // Taux de marge 2700 / 3000 × 100 = 90.00%
    expect(ligne?.tauxMarge).toBe('90.00');
    // Valeur de stock : 17 unités (10 − 4 + 10 + 1 retour) × CMP courant 162.50
    expect(ligne?.valeurStock).toBe('2762.50');
  });

  it('refuse un rôle hors ROLES_LECTURE_CAISSES (RESPONSABLE_SI) → 403', async () => {
    await request(app.getHttpServer())
      .get('/reporting/dashboard')
      .set(auth(tokens.si))
      .expect(403);
  });
});
