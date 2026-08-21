// Commande groupe → réception hub ENTREE → répartition TRANSFERT vers boutiques.
// Couvre Achats mutualisés + hub réseau (Plan) ; RBAC répartition multi-sites.
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
process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Hub stock — réception groupe + répartition (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  let produitId: string;
  let fournisseurId: string;
  let boutiqueId: string;
  let autreBoutiqueId: string;
  let principalBoutiqueId: string;
  let autrePrincipalId: string;
  let hubStockId: string;
  let quaiId: string;

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  async function login(loginValue: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: MOT_DE_PASSE })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  async function creerUtilisateur(
    loginValue: string,
    roleLibelle: string,
    boutiqueIdUser: string | null,
    niveau: number,
  ) {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation: niveau },
    });
    await env.prisma.utilisateur.create({
      data: {
        login: loginValue,
        passwordHash: await bcrypt.hash(MOT_DE_PASSE, 10),
        nom: 'Test',
        prenom: loginValue,
        actif: true,
        roleId: role.id,
        boutiqueId: boutiqueIdUser,
      },
    });
  }

  beforeAll(async () => {
    await env.start();
    const zone = await env.prisma.zone.create({
      data: { nomZone: 'Zone Hub' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Hub A', adresse: 'Adr', zoneId: zone.id },
    });
    boutiqueId = boutique.id;
    const principal = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal A',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        usage: 'STOCK',
        boutiqueId,
      },
    });
    principalBoutiqueId = principal.id;

    const autre = await env.prisma.boutique.create({
      data: { nom: 'Boutique Hub B', adresse: 'Adr B', zoneId: zone.id },
    });
    autreBoutiqueId = autre.id;
    const autrePrincipal = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal B',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        usage: 'STOCK',
        boutiqueId: autre.id,
      },
    });
    autrePrincipalId = autrePrincipal.id;

    const hub = await env.prisma.boutique.create({
      data: {
        nom: 'Entrepôt Central',
        adresse: 'Siège',
        code: 'WH-CENTRAL',
        zoneId: zone.id,
      },
    });
    const stock = await env.prisma.entrepot.create({
      data: {
        nom: 'Stock central',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        usage: 'STOCK',
        reseau: true,
        boutiqueId: hub.id,
      },
    });
    const quai = await env.prisma.entrepot.create({
      data: {
        nom: 'Quai',
        code: 'ENTREE',
        type: 'SECONDAIRE',
        usage: 'ENTREE',
        reseau: true,
        boutiqueId: hub.id,
      },
    });
    hubStockId = stock.id;
    quaiId = quai.id;

    await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId, libelle: 'Magasin A' },
    });

    await creerUtilisateur('si-hub', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('daf-hub', 'DAF', null, 1);
    await creerUtilisateur('resp-hub', 'RESPONSABLE_BOUTIQUE', boutiqueId, 3);
    await creerUtilisateur('caiss-hub', 'CAISSIER_BOUTIQUE', boutiqueId, 4);

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Article Hub',
        prixUnitaire: '3000.00',
        stock: 0,
        coutMoyenPondere: 1000,
      },
    });
    produitId = produit.id;
    const fournisseur = await env.prisma.fournisseur.create({
      data: { nom: 'Grossiste Hub', actif: true },
    });
    fournisseurId = fournisseur.id;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(env.prisma)
      .compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    tokens.si = await login('si-hub');
    tokens.daf = await login('daf-hub');
    tokens.resp = await login('resp-hub');
    tokens.caiss = await login('caiss-hub');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse réception commande groupe hors quai ENTREE hub', async () => {
    const created = await request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.si))
      .send({
        fournisseurId,
        lignes: [{ produitId, quantite: 10, prixUnitaire: 1000 }],
      })
      .expect(201);
    const commandeId = (created.body as { id: string }).id;
    const ligneId = (created.body as { lignes: Array<{ id: string }> })
      .lignes[0].id;

    await request(app.getHttpServer())
      .post(`/achats/commandes/${commandeId}/confirmer`)
      .set(auth(tokens.si))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.si))
      .send({
        produitId,
        quantite: 5,
        prixAchat: 1000,
        entrepotId: principalBoutiqueId,
        ligneCommandeId: ligneId,
      })
      .expect(400);
  });

  it('réception groupe → stock hub uniquement ; répartition → boutique ; 403 multi-sites boutique', async () => {
    const created = await request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.si))
      .send({
        fournisseurId,
        lignes: [{ produitId, quantite: 20, prixUnitaire: 1100 }],
      })
      .expect(201);
    const commande = created.body as {
      id: string;
      boutiqueId: string | null;
      lignes: Array<{ id: string }>;
    };
    expect(commande.boutiqueId).toBeNull();
    const ligneId = commande.lignes[0].id;

    await request(app.getHttpServer())
      .post(`/achats/commandes/${commande.id}/confirmer`)
      .set(auth(tokens.si))
      .expect(201);

    const rec = await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.si))
      .send({
        produitId,
        quantite: 20,
        prixAchat: 1100,
        ligneCommandeId: ligneId,
      })
      .expect(201);
    const receptionId = (rec.body as { id: string; entrepotId: string }).id;
    expect((rec.body as { entrepotId: string }).entrepotId).toBe(quaiId);

    const quantBoutiqueAvant = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: {
          produitId,
          entrepotId: principalBoutiqueId,
        },
      },
    });
    expect(quantBoutiqueAvant?.quantite ?? 0).toBe(0);

    const repart = await request(app.getHttpServer())
      .post(`/achats/receptions/${receptionId}/repartir`)
      .set(auth(tokens.si))
      .send({
        pret: true,
        lignes: [
          { produitId, quantite: 12, boutiqueId },
          { produitId, quantite: 8, boutiqueId: autreBoutiqueId },
        ],
      })
      .expect(201);
    const bons = (
      repart.body as { bons: Array<{ id: string; statut: string }> }
    ).bons;
    expect(bons).toHaveLength(2);
    expect(bons.every((b) => b.statut === 'PRET')).toBe(true);

    const hubStock = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: { produitId, entrepotId: hubStockId },
      },
    });
    expect(hubStock?.quantite).toBe(20);

    for (const bon of bons) {
      await request(app.getHttpServer())
        .post(`/stocks/bons/${bon.id}/valider`)
        .set(auth(tokens.si))
        .expect(201);
    }

    const apresHub = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: { produitId, entrepotId: hubStockId },
      },
    });
    const apresA = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: {
          produitId,
          entrepotId: principalBoutiqueId,
        },
      },
    });
    const apresB = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: { produitId, entrepotId: autrePrincipalId },
      },
    });
    expect(apresHub?.quantite ?? 0).toBe(0);
    expect(apresA?.quantite).toBe(12);
    expect(apresB?.quantite).toBe(8);

    await request(app.getHttpServer())
      .post(`/achats/receptions/${receptionId}/repartir`)
      .set(auth(tokens.resp))
      .send({
        lignes: [{ produitId, quantite: 1, boutiqueId: autreBoutiqueId }],
      })
      .expect(403);

    await request(app.getHttpServer())
      .post(`/achats/receptions/${receptionId}/repartir`)
      .set(auth(tokens.caiss))
      .send({
        lignes: [{ produitId, quantite: 1, boutiqueId }],
      })
      .expect(403);
  });
});
