// Tests d'intégration réels (zéro mock) — extension pose/installation
// (validée par l'utilisateur, hors MCD §6.5 d'origine, même statut que
// l'extension "Achats" de packages/shared/src/enums.ts). Démarre un vrai
// PostgreSQL via Testcontainers et authentifie chaque profil via le vrai
// endpoint /auth/login.
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

interface SessionCaisseDto {
  id: string;
}

interface OrdreDePoseResume {
  id: string;
  statut: string;
  qrCodeBase64: string;
}

interface VenteDto {
  id: string;
  ordreDePose?: OrdreDePoseResume | null;
}

interface OrdreDePoseDto {
  id: string;
  statut: string;
  boutiqueId: string;
  qrToken: string;
  technicienId: string | null;
}

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Ordres de pose / installation — extension validée (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  let boutique1Id: string;
  let boutique2Id: string;
  let caisse1Id: string;
  let produitAvecPoseId: string;
  let produitSansPoseId: string;

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

  function ouvrirSession(
    token: string,
    caisseId: string,
    fondInitial: number,
    temoinLogin: string,
  ) {
    return request(app.getHttpServer())
      .post('/ventes/sessions')
      .set(auth(token))
      .send({
        caisseId,
        fondInitial,
        temoinLogin,
        temoinPassword: MOT_DE_PASSE,
      });
  }

  // Une seule session OUVERTE est autorisée par tiroir (ventes.service.ts) :
  // chaque `it` de ce fichier n'a pas besoin d'une session dédiée, donc on
  // réutilise la session déjà ouverte par un test précédent plutôt que
  // d'échouer avec 400 « déjà ouverte ».
  async function ouvrirOuReprendreSession(
    token: string,
    caisseId: string,
    fondInitial: number,
    temoinLogin: string,
  ): Promise<string> {
    const ouverture = await ouvrirSession(
      token,
      caisseId,
      fondInitial,
      temoinLogin,
    );
    if (ouverture.status === 201) {
      return (ouverture.body as SessionCaisseDto).id;
    }
    const sessions = await request(app.getHttpServer())
      .get('/ventes/sessions')
      .set(auth(token))
      .expect(200);
    const session = (
      sessions.body as Array<{ id: string; statut: string }>
    ).find((s) => s.statut === 'OUVERTE');
    if (!session) {
      throw new Error('Aucune session OUVERTE trouvée après échec d’ouverture');
    }
    return session.id;
  }

  beforeAll(async () => {
    await env.start();

    const zone = await env.prisma.zone.create({ data: { nomZone: 'Zone A' } });
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 1', adresse: 'Adresse 1', zoneId: zone.id },
    });
    const boutique2 = await env.prisma.boutique.create({
      data: { nom: 'Boutique 2', adresse: 'Adresse 2', zoneId: zone.id },
    });
    boutique1Id = boutique1.id;
    boutique2Id = boutique2.id;

    const entrepot1 = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B1',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique1Id,
      },
    });

    await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.MAGASIN,
        boutiqueId: boutique1Id,
        libelle: 'Magasin B1',
      },
    });
    const caisse1 = await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.TIROIR,
        boutiqueId: boutique1Id,
        code: 'T01',
        libelle: 'Tiroir 1',
        actif: true,
        ordreAffichage: 1,
      },
    });
    caisse1Id = caisse1.id;

    const produitAvecPose = await env.prisma.produit.create({
      data: {
        designation: 'Pneu 185/65 R15',
        prixUnitaire: '45000.00',
        stock: 10,
        necessitePose: true,
      },
    });
    produitAvecPoseId = produitAvecPose.id;
    const produitSansPose = await env.prisma.produit.create({
      data: {
        designation: 'Coque téléphone',
        prixUnitaire: '1000.00',
        stock: 10,
      },
    });
    produitSansPoseId = produitSansPose.id;

    await env.prisma.stockQuant.createMany({
      data: [
        {
          produitId: produitAvecPoseId,
          entrepotId: entrepot1.id,
          quantite: 10,
        },
        {
          produitId: produitSansPoseId,
          entrepotId: entrepot1.id,
          quantite: 10,
        },
      ],
    });

    await creerUtilisateur('caissier-b1', 'CAISSIER_BOUTIQUE', boutique1Id, 4);
    await creerUtilisateur('resp-b1', 'RESPONSABLE_BOUTIQUE', boutique1Id, 3);
    await creerUtilisateur('technicien-b1', 'TECHNICIEN_POSE', boutique1Id, 4);
    await creerUtilisateur(
      'technicien-b1-bis',
      'TECHNICIEN_POSE',
      boutique1Id,
      4,
    );
    await creerUtilisateur('technicien-b2', 'TECHNICIEN_POSE', boutique2Id, 4);
    await creerUtilisateur('daf', 'DAF', null, 1);
    await creerUtilisateur('crm-reseau', 'RESPONSABLE_CRM', null, 1);

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

    tokens.caissierB1 = await login('caissier-b1');
    tokens.respB1 = await login('resp-b1');
    tokens.technicienB1 = await login('technicien-b1');
    tokens.technicienB1Bis = await login('technicien-b1-bis');
    tokens.technicienB2 = await login('technicien-b2');
    tokens.daf = await login('daf');
    tokens.crmReseau = await login('crm-reseau');
  }, 120_000);

  afterAll(async () => {
    await app.close();
    await env.stop();
  });

  it('refuse (400) avecPose=true sur un produit sans option pose/installation', async () => {
    const ouverture = await ouvrirSession(
      tokens.caissierB1,
      caisse1Id,
      1000,
      'resp-b1',
    ).expect(201);
    const sessionId = (ouverture.body as SessionCaisseDto).id;

    await request(app.getHttpServer())
      .post(`/ventes/sessions/${sessionId}/ventes`)
      .set(auth(tokens.caissierB1))
      .send({
        lignes: [{ produitId: produitSansPoseId, quantite: 1, avecPose: true }],
        modePaiement: 'ESPECES',
      })
      .expect(400);
  });

  describe('Encaissement d’une vente avec option pose — crée un OrdreDePose', () => {
    let sessionId: string;
    let venteId: string;
    let ordreDePoseId: string;
    let qrToken: string;

    it('encaisse la vente, renvoie le reçu atelier (QR) et crée l’OrdreDePose EN_ATTENTE', async () => {
      sessionId = await ouvrirOuReprendreSession(
        tokens.caissierB1,
        caisse1Id,
        1000,
        'resp-b1',
      );

      const response = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [
            { produitId: produitAvecPoseId, quantite: 1, avecPose: true },
          ],
          modePaiement: 'ESPECES',
        })
        .expect(201);

      const body = response.body as VenteDto;
      venteId = body.id;
      expect(body.ordreDePose).not.toBeNull();
      expect(body.ordreDePose?.statut).toBe('EN_ATTENTE');
      expect(typeof body.ordreDePose?.qrCodeBase64).toBe('string');
      expect(body.ordreDePose!.qrCodeBase64.length).toBeGreaterThan(50);
      ordreDePoseId = body.ordreDePose!.id;

      const enBase = await env.prisma.ordreDePose.findUnique({
        where: { id: ordreDePoseId },
      });
      expect(enBase).not.toBeNull();
      expect(enBase?.statut).toBe('EN_ATTENTE');
      expect(enBase?.venteId).toBe(venteId);
      expect(enBase?.boutiqueId).toBe(boutique1Id);
      qrToken = enBase!.qrToken;

      const lignesPose = await env.prisma.lignePose.count({
        where: { ordreDePoseId },
      });
      expect(lignesPose).toBe(1);

      const auditVente = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'Vente',
          entiteId: venteId,
          action: 'VENTE_ENREGISTREE',
        },
      });
      expect(auditVente).not.toBeNull();
    });

    it('refuse (403) qu’un CAISSIER_BOUTIQUE démarre un ordre de pose', async () => {
      await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/demarrer`)
        .set(auth(tokens.caissierB1))
        .send({ qrToken })
        .expect(403);
    });

    it('refuse (403) qu’un technicien d’une autre boutique démarre cet ordre', async () => {
      await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/demarrer`)
        .set(auth(tokens.technicienB2))
        .send({ qrToken })
        .expect(403);
    });

    it('refuse (400) un qrToken invalide', async () => {
      await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/demarrer`)
        .set(auth(tokens.technicienB1))
        .send({ qrToken: 'faux-token-0000-0000-0000-000000000000' })
        .expect(400);
    });

    it('démarre la pose avec le bon QR, journalise ORDRE_POSE_DEMARRE', async () => {
      const response = await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/demarrer`)
        .set(auth(tokens.technicienB1))
        .send({ qrToken })
        .expect(200);

      const body = response.body as OrdreDePoseDto;
      expect(body.statut).toBe('EN_COURS');
      expect(body.technicienId).toEqual(expect.any(String));

      const audit = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'OrdreDePose',
          entiteId: ordreDePoseId,
          action: 'ORDRE_POSE_DEMARRE',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('rejette une transition EN_ATTENTE -> TERMINEE (transition illégale, via /demarrer déjà franchi)', async () => {
      // L'ordre est désormais EN_COURS : retenter /demarrer doit échouer
      // (transition EN_COURS -> EN_COURS non autorisée par la machine à états).
      await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/demarrer`)
        .set(auth(tokens.technicienB1))
        .send({ qrToken })
        .expect(400);
    });

    it('refuse (403) qu’un technicien différent de celui qui a démarré termine la pose', async () => {
      await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/terminer`)
        .set(auth(tokens.technicienB1Bis))
        .expect(403);
    });

    it('termine la pose avec le même technicien, journalise ORDRE_POSE_TERMINE', async () => {
      const response = await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/terminer`)
        .set(auth(tokens.technicienB1))
        .expect(200);

      const body = response.body as OrdreDePoseDto;
      expect(body.statut).toBe('TERMINEE');

      const audit = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'OrdreDePose',
          entiteId: ordreDePoseId,
          action: 'ORDRE_POSE_TERMINE',
        },
      });
      expect(audit).not.toBeNull();
    });

    it('refuse (400) de terminer une pose déjà terminée (statut terminal)', async () => {
      await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/terminer`)
        .set(auth(tokens.technicienB1))
        .expect(400);
    });
  });

  describe('Annulation d’un ordre de pose', () => {
    let ordreDePoseId: string;

    beforeAll(async () => {
      const sessionId = await ouvrirOuReprendreSession(
        tokens.caissierB1,
        caisse1Id,
        0,
        'resp-b1',
      );

      const response = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [
            { produitId: produitAvecPoseId, quantite: 1, avecPose: true },
          ],
          modePaiement: 'CARTE',
        })
        .expect(201);
      ordreDePoseId = (response.body as VenteDto).ordreDePose!.id;
    });

    it('refuse (403) qu’un technicien pose annule un ordre (réservé encadrement)', async () => {
      await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/annuler`)
        .set(auth(tokens.technicienB1))
        .send({ motif: 'Client absent' })
        .expect(403);
    });

    it('autorise le RESPONSABLE_BOUTIQUE à annuler, journalise ORDRE_POSE_ANNULE', async () => {
      const response = await request(app.getHttpServer())
        .post(`/ordres-pose/${ordreDePoseId}/annuler`)
        .set(auth(tokens.respB1))
        .send({ motif: 'Client finalement non intéressé' })
        .expect(200);

      const body = response.body as OrdreDePoseDto;
      expect(body.statut).toBe('ANNULEE');

      const audit = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'OrdreDePose',
          entiteId: ordreDePoseId,
          action: 'ORDRE_POSE_ANNULE',
        },
      });
      expect(audit).not.toBeNull();
    });
  });

  describe('GET /ordres-pose/:id — lecture', () => {
    it('refuse (401) sans authentification', async () => {
      await request(app.getHttpServer())
        .get('/ordres-pose/00000000-0000-0000-0000-000000000000')
        .expect(401);
    });

    it('refuse (403) un RESPONSABLE_CRM — hors périmètre lecture pose (ni caisses, ni atelier)', async () => {
      const sessionId = await ouvrirOuReprendreSession(
        tokens.caissierB1,
        caisse1Id,
        0,
        'resp-b1',
      );

      const response = await request(app.getHttpServer())
        .post(`/ventes/sessions/${sessionId}/ventes`)
        .set(auth(tokens.caissierB1))
        .send({
          lignes: [
            { produitId: produitAvecPoseId, quantite: 1, avecPose: true },
          ],
          modePaiement: 'ESPECES',
        })
        .expect(201);
      const ordreDePoseId = (response.body as VenteDto).ordreDePose!.id;

      await request(app.getHttpServer())
        .get(`/ordres-pose/${ordreDePoseId}`)
        .set(auth(tokens.crmReseau))
        .expect(403);

      await request(app.getHttpServer())
        .get(`/ordres-pose/${ordreDePoseId}`)
        .set(auth(tokens.technicienB1))
        .expect(200);

      // Lecture réseau trésorerie (DAF) — pas de droit d'agir sur la pose,
      // mais vue consolidée autorisée (même logique que ROLES_LECTURE_CAISSES).
      await request(app.getHttpServer())
        .get(`/ordres-pose/${ordreDePoseId}`)
        .set(auth(tokens.daf))
        .expect(200);
    });
  });
});
