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

describe('Inventory réseau — bons de stock (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  let produitId: string;
  let fournisseurId: string;
  let boutiqueId: string;
  let principalBoutiqueId: string;
  let centralStockId: string;
  let quaiId: string;
  let perteId: string;
  let caisseTiroirId: string;

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
    const zone = await env.prisma.zone.create({ data: { nomZone: 'Zone Inv' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Inv', adresse: 'Adr', zoneId: zone.id },
    });
    boutiqueId = boutique.id;
    const principal = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal Inv',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        usage: 'STOCK',
        boutiqueId,
      },
    });
    principalBoutiqueId = principal.id;

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
    const perte = await env.prisma.entrepot.create({
      data: {
        nom: 'Pertes',
        code: 'PERTE',
        type: 'SECONDAIRE',
        usage: 'PERTE',
        reseau: true,
        boutiqueId: hub.id,
      },
    });
    centralStockId = stock.id;
    quaiId = quai.id;
    perteId = perte.id;

    await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId, libelle: 'Magasin Inv' },
    });
    const tiroir = await env.prisma.caisse.create({
      data: {
        type: TypeCaisse.TIROIR,
        boutiqueId,
        code: 'T01',
        libelle: 'Tiroir Inv',
        actif: true,
        ordreAffichage: 1,
      },
    });
    caisseTiroirId = tiroir.id;

    await creerUtilisateur('si-inv', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('resp-inv', 'RESPONSABLE_BOUTIQUE', boutiqueId, 3);
    await creerUtilisateur('caiss-inv', 'CAISSIER_BOUTIQUE', boutiqueId, 4);
    await creerUtilisateur('crm-inv', 'RESPONSABLE_CRM', null, 1);

    const produit = await env.prisma.produit.create({
      data: {
        designation: 'Coque Inv',
        prixUnitaire: '2000.00',
        stock: 0,
        strategieSortie: 'FIFO',
      },
    });
    produitId = produit.id;
    const fournisseur = await env.prisma.fournisseur.create({
      data: { nom: 'Fournisseur Inv', actif: true },
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

    tokens.si = await login('si-inv');
    tokens.resp = await login('resp-inv');
    tokens.caiss = await login('caiss-inv');
    tokens.crm = await login('crm-inv');
  });

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse (403) une réception fournisseur par le responsable boutique', async () => {
    await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.resp))
      .send({ produitId, quantite: 4, prixAchat: 800 })
      .expect(403);
  });

  it('BROUILLON n’écrit pas StockQuant ; PRET→FAIT écrit les mouvements', async () => {
    const rec = await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.si))
      .send({
        produitId,
        quantite: 10,
        prixAchat: 800,
        entrepotId: quaiId,
      })
      .expect(201);

    const quantQuai = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: { produitId, entrepotId: quaiId },
      },
    });
    expect(quantQuai?.quantite ?? 0).toBe(0);

    const bons = await request(app.getHttpServer())
      .get('/stocks/bons')
      .set(auth(tokens.si))
      .expect(200);
    const bon = (bons.body as Array<{ id: string; receptionId: string; statut: string }>)
      .find((b) => b.receptionId === (rec.body as { id: string }).id);
    expect(bon?.statut).toBe('BROUILLON');

    await request(app.getHttpServer())
      .post(`/stocks/bons/${bon!.id}/pret`)
      .set(auth(tokens.si))
      .expect(201);

    await request(app.getHttpServer())
      .post(`/stocks/bons/${bon!.id}/valider`)
      .set(auth(tokens.si))
      .expect(201);

    const apres = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: { produitId, entrepotId: quaiId },
      },
    });
    expect(apres?.quantite).toBe(10);

    const mvts = await env.prisma.mouvementStock.findMany({
      where: { produitId, entrepotId: quaiId, type: 'RECEPTION' },
    });
    expect(mvts).toHaveLength(1);
  });

  it('refuse une transition FAIT depuis BROUILLON', async () => {
    const created = await request(app.getHttpServer())
      .post('/stocks/bons')
      .set(auth(tokens.si))
      .send({
        type: 'TRANSFERT_INTERNE',
        entrepotSourceId: quaiId,
        entrepotDestId: centralStockId,
        lignes: [{ produitId, quantite: 1 }],
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/stocks/bons/${id}/valider`)
      .set(auth(tokens.si))
      .expect(400);
  });

  it('transfert interne PRET→FAIT écrit TRANSFERT_OUT et TRANSFERT_IN', async () => {
    const created = await request(app.getHttpServer())
      .post('/stocks/bons')
      .set(auth(tokens.si))
      .send({
        type: 'TRANSFERT_INTERNE',
        entrepotSourceId: quaiId,
        entrepotDestId: centralStockId,
        notes: 'Mise en stock',
        lignes: [{ produitId, quantite: 8 }],
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/stocks/bons/${id}/pret`)
      .set(auth(tokens.si))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/stocks/bons/${id}/valider`)
      .set(auth(tokens.si))
      .expect(201);

    const src = await env.prisma.stockQuant.findUnique({
      where: { produitId_entrepotId: { produitId, entrepotId: quaiId } },
    });
    const dest = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: { produitId, entrepotId: centralStockId },
      },
    });
    expect(src?.quantite).toBe(2);
    expect(dest?.quantite).toBe(8);
    const out = await env.prisma.mouvementStock.count({
      where: { produitId, type: 'TRANSFERT_OUT', reference: (created.body as { numero: string }).numero },
    });
    const inn = await env.prisma.mouvementStock.count({
      where: { produitId, type: 'TRANSFERT_IN', reference: (created.body as { numero: string }).numero },
    });
    expect(out).toBe(1);
    expect(inn).toBe(1);
  });

  it('le caissier boutique ne peut pas créer un bon (403)', async () => {
    await request(app.getHttpServer())
      .post('/stocks/bons')
      .set(auth(tokens.caiss))
      .send({
        type: 'TRANSFERT_INTERNE',
        entrepotSourceId: centralStockId,
        entrepotDestId: principalBoutiqueId,
        lignes: [{ produitId, quantite: 1 }],
      })
      .expect(403);
  });

  it('approvisionnement magasin puis vente POS sur PRINCIPAL boutique', async () => {
    const created = await request(app.getHttpServer())
      .post('/stocks/bons')
      .set(auth(tokens.si))
      .send({
        type: 'TRANSFERT_INTERNE',
        entrepotSourceId: centralStockId,
        entrepotDestId: principalBoutiqueId,
        lignes: [{ produitId, quantite: 5 }],
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/stocks/bons/${id}/pret`)
      .set(auth(tokens.si))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/stocks/bons/${id}/valider`)
      .set(auth(tokens.resp))
      .expect(201);

    const mag = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: { produitId, entrepotId: principalBoutiqueId },
      },
    });
    expect(mag?.quantite).toBe(5);

    const session = await request(app.getHttpServer())
      .post('/ventes/sessions')
      .set(auth(tokens.caiss))
      .send({
        caisseId: caisseTiroirId,
        fondInitial: 0,
        temoinLogin: 'resp-inv',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/ventes/sessions/${(session.body as { id: string }).id}/ventes`)
      .set(auth(tokens.caiss))
      .send({
        lignes: [{ produitId, quantite: 1 }],
        modePaiement: 'ESPECES',
      })
      .expect(201);

    const apresVente = await env.prisma.stockQuant.findUnique({
      where: {
        produitId_entrepotId: { produitId, entrepotId: principalBoutiqueId },
      },
    });
    expect(apresVente?.quantite).toBe(4);
  });

  it('qualité : rebut à la réception va en PERTE (SCRAP)', async () => {
    const rec = await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.si))
      .send({
        produitId,
        quantite: 4,
        prixAchat: 700,
        entrepotId: quaiId,
      })
      .expect(201);
    const bons = await request(app.getHttpServer())
      .get('/stocks/bons')
      .set(auth(tokens.si))
      .expect(200);
    const bon = (bons.body as Array<{ id: string; receptionId: string }>).find(
      (b) => b.receptionId === (rec.body as { id: string }).id,
    );
    await env.prisma.ligneBonStock.updateMany({
      where: { bonId: bon!.id },
      data: { quantiteOk: 3, quantiteRebut: 1 },
    });
    await request(app.getHttpServer())
      .post(`/stocks/bons/${bon!.id}/pret`)
      .set(auth(tokens.si))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/stocks/bons/${bon!.id}/valider`)
      .set(auth(tokens.si))
      .expect(201);
    const rebut = await env.prisma.stockQuant.findUnique({
      where: { produitId_entrepotId: { produitId, entrepotId: perteId } },
    });
    expect(rebut?.quantite).toBe(1);
    const scraps = await env.prisma.mouvementStock.count({
      where: { produitId, type: 'SCRAP' },
    });
    expect(scraps).toBeGreaterThanOrEqual(1);
  });

  it('lanceur réappro crée un bon de transfert si sous le min', async () => {
    await request(app.getHttpServer())
      .post('/stocks/reappro')
      .set(auth(tokens.si))
      .send({
        produitId,
        entrepotId: principalBoutiqueId,
        min: 20,
        max: 30,
      })
      .expect(201);
    const launched = await request(app.getHttpServer())
      .post('/stocks/reappro/lancer')
      .set(auth(tokens.si))
      .expect(201);
    expect((launched.body as { bonsCrees: number }).bonsCrees).toBeGreaterThanOrEqual(1);
  });

  it('stock prévu = physique − réservé + commandes + bons PRET', async () => {
    const prevu = await request(app.getHttpServer())
      .get('/stocks/prevu')
      .query({ produitId, entrepotId: principalBoutiqueId })
      .set(auth(tokens.si))
      .expect(200);
    expect(prevu.body).toHaveProperty('physique');
    expect(prevu.body).toHaveProperty('prevu');
  });

  it('lot + coût logistique + emplacements listés', async () => {
    await request(app.getHttpServer())
      .post('/stocks/lots')
      .set(auth(tokens.si))
      .send({ produitId, numero: 'LOT-INV-1' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/stocks/couts-logistiques')
      .set(auth(tokens.si))
      .send({ produitId, libelle: 'Fret', montant: 500 })
      .expect(201);
    const empls = await request(app.getHttpServer())
      .get('/stocks/emplacements')
      .set(auth(tokens.si))
      .expect(200);
    expect((empls.body as unknown[]).length).toBeGreaterThanOrEqual(4);
  });
});
