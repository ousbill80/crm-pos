// E2E — ajout de zone/boutique « à chaud » (§6.7 : « ajout de boutique/zone
// sans reparamétrage lourd de l'application »). Prouve qu'une zone puis une
// boutique créées via l'API, sur une instance NestJS déjà démarrée (aucun
// redémarrage entre `beforeAll` et ces tests), sont immédiatement
// opérationnelles : provisionnement auto de l'entrepôt + caisses POS, et
// capacité à ouvrir une session de caisse et encaisser une vente réelle.
// Zéro mock : PostgreSQL Testcontainers.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { ModePaiement } from '@caisse-crm/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-zones-boutiques-dynamic-e2e';

describe('Ajout boutique/zone à chaud, sans redémarrage (e2e, §6.7)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  const tokens: Record<string, string> = {};
  let zoneId: string;
  let boutiqueId: string;
  let tiroirId: string;
  let produitId: string;

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
    boutiqueIdParam: string | null,
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
        boutiqueId: boutiqueIdParam,
      },
    });
    return utilisateur.id;
  }

  beforeAll(async () => {
    // L'application NestJS est instanciée une seule fois ici et ne sera
    // jamais redémarrée : toute la suite doit fonctionner sur cette même
    // instance, ce qui est précisément ce que §6.7 exige de la structure
    // organisationnelle réelle (ajout d'une boutique en cours de vie de
    // l'app, sans redéploiement).
    await env.start();

    await creerUtilisateur('respsi-dyn', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('caissier-central-dyn', 'CAISSIER_CENTRAL', null, 1);

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

    tokens.respsi = await login('respsi-dyn');
    tokens.caissierCentral = await login('caissier-central-dyn');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse la création de zone à un rôle non habilité (RBAC serveur, §4)', async () => {
    await request(app.getHttpServer())
      .post('/zones')
      .set(auth(tokens.caissierCentral))
      .send({ nomZone: 'Zone refusée' })
      .expect(403);
  });

  it('crée une nouvelle zone à chaud, sur l’instance déjà démarrée', async () => {
    const response = await request(app.getHttpServer())
      .post('/zones')
      .set(auth(tokens.respsi))
      .send({ nomZone: 'Zone créée à chaud' })
      .expect(201);
    const body = response.body as { id: string; nomZone: string };
    expect(body.nomZone).toBe('Zone créée à chaud');
    zoneId = body.id;

    // Immédiatement listable, sans redémarrage.
    const liste = await request(app.getHttpServer())
      .get('/zones')
      .set(auth(tokens.respsi))
      .expect(200);
    expect((liste.body as { id: string }[]).some((z) => z.id === zoneId)).toBe(
      true,
    );
  });

  it('crée une boutique dans cette zone et provisionne automatiquement entrepôt + caisse magasin + tiroir POS (§6.7 sans reparamétrage lourd)', async () => {
    const response = await request(app.getHttpServer())
      .post('/boutiques')
      .set(auth(tokens.respsi))
      .send({
        nom: 'Boutique créée à chaud',
        adresse: 'Rue du test dynamique',
        zoneId,
        nombreTiroirs: 1,
      })
      .expect(201);
    const body = response.body as { id: string; nom: string; zoneId: string };
    expect(body.zoneId).toBe(zoneId);
    boutiqueId = body.id;

    const entrepot = await env.prisma.entrepot.findUnique({
      where: { boutiqueId_code: { boutiqueId, code: 'PRINCIPAL' } },
    });
    expect(entrepot).not.toBeNull();

    const magasin = await env.prisma.caisse.findFirst({
      where: { boutiqueId, type: 'MAGASIN' },
    });
    expect(magasin).not.toBeNull();

    const tiroir = await env.prisma.caisse.findFirst({
      where: { boutiqueId, type: 'TIROIR', code: 'T01' },
    });
    expect(tiroir).not.toBeNull();
    expect(tiroir?.actif).toBe(true);
    tiroirId = tiroir!.id;
  });

  it('la boutique créée à chaud est immédiatement opérationnelle : session de caisse + vente réelle, sans redémarrage', async () => {
    // Stock disponible dans l'entrepôt auto-provisionné de la nouvelle boutique.
    const entrepot = await env.prisma.entrepot.findUniqueOrThrow({
      where: { boutiqueId_code: { boutiqueId, code: 'PRINCIPAL' } },
    });
    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Article boutique dynamique',
        prixUnitaire: '2500.00',
        stock: 0,
      },
    });
    produitId = produit.id;
    await env.prisma.stockQuant.create({
      data: { produitId, entrepotId: entrepot.id, quantite: 10 },
    });

    await creerUtilisateur('caissier-dyn', 'CAISSIER_BOUTIQUE', boutiqueId, 4);
    await creerUtilisateur('resp-dyn', 'RESPONSABLE_BOUTIQUE', boutiqueId, 3);
    tokens.caissierDyn = await login('caissier-dyn');

    const temoins = await request(app.getHttpServer())
      .get('/ventes/temoins-eligibles')
      .set(auth(tokens.caissierDyn))
      .expect(200);
    expect(
      (temoins.body as { login: string }[]).some((t) => t.login === 'resp-dyn'),
    ).toBe(true);

    const sessionResponse = await request(app.getHttpServer())
      .post('/ventes/sessions')
      .set(auth(tokens.caissierDyn))
      .send({
        caisseId: tiroirId,
        fondInitial: 0,
        temoinLogin: 'resp-dyn',
        temoinPassword: MOT_DE_PASSE,
      })
      .expect(201);
    const sessionId = (sessionResponse.body as { id: string }).id;

    await request(app.getHttpServer())
      .post(`/ventes/sessions/${sessionId}/ventes`)
      .set(auth(tokens.caissierDyn))
      .send({
        lignes: [{ produitId, quantite: 2 }],
        modePaiement: ModePaiement.ESPECES,
        paiements: [{ modePaiement: ModePaiement.ESPECES, montant: 5000 }],
      })
      .expect(201);

    // Clôture (§5.1) : reconnaît l'encaissement sur le tiroir et remet le
    // montant compté vers la caisse magasin auto-provisionnée — preuve que
    // tout le grand livre (§6.4) fonctionne bout en bout sur cette boutique
    // créée à chaud.
    await request(app.getHttpServer())
      .post(`/ventes/sessions/${sessionId}/cloture`)
      .set(auth(tokens.caissierDyn))
      .send({
        fondCompteCloture: 5000,
        temoinLogin: 'resp-dyn',
        temoinPassword: MOT_DE_PASSE,
      })
      .expect(201);

    const magasin = await env.prisma.caisse.findFirstOrThrow({
      where: { boutiqueId, type: 'MAGASIN' },
    });
    const soldeMagasin = await request(app.getHttpServer())
      .get(`/caisses/${magasin.id}/solde`)
      .set(auth(tokens.caissierDyn))
      .expect(200);
    expect((soldeMagasin.body as { solde: string }).solde).toBe('5000.00');

    const soldeTiroir = await request(app.getHttpServer())
      .get(`/caisses/${tiroirId}/solde`)
      .set(auth(tokens.caissierDyn))
      .expect(200);
    expect((soldeTiroir.body as { solde: string }).solde).toBe('0.00');
  });
});
