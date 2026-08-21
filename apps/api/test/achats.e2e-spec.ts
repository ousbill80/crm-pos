// Cycle Achats complet (commande → réception plafonnée → facture → paiement).
// Extension validée utilisateur, hors MCD §6.5 d'origine. Les paiements
// n'écrivent pas dans TRANSACTION_CAISSE (§6.4). PostgreSQL réel via Testcontainers.
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('Achats — commandes, factures, paiements (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  const tokens: Record<string, string> = {};
  let produitId: string;
  let fournisseurId: string;
  let entrepotId: string;

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
  ) {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation },
    });
    await env.prisma.utilisateur.create({
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
  }

  function auth(token: string) {
    return { Authorization: `Bearer ${token}` };
  }

  beforeAll(async () => {
    await env.start();
    const zone = await env.prisma.zone.create({
      data: { nomZone: 'Zone Achats' },
    });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique Achats', adresse: 'Adr', zoneId: zone.id },
    });
    const entrepot = await env.prisma.entrepot.create({
      data: {
        nom: 'Principal Achats',
        code: 'PRINCIPAL',
        type: 'PRINCIPAL',
        boutiqueId: boutique.id,
      },
    });
    entrepotId = entrepot.id;

    const hub = await env.prisma.boutique.create({
      data: {
        nom: 'Entrepôt Central Achats',
        adresse: 'Siège',
        code: 'WH-CENTRAL',
        zoneId: zone.id,
      },
    });
    await env.prisma.entrepot.create({
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
        nom: 'Quai réception',
        code: 'ENTREE',
        type: 'SECONDAIRE',
        usage: 'ENTREE',
        reseau: true,
        boutiqueId: hub.id,
      },
    });
    // Réceptions commande groupe (boutiqueId null) ciblent le quai hub.
    entrepotId = quai.id;

    await creerUtilisateur('respsi-achats', 'RESPONSABLE_SI', null, 1);
    await creerUtilisateur('daf-achats', 'DAF', null, 1);
    await creerUtilisateur('central-achats', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur(
      'caissier-achats',
      'CAISSIER_BOUTIQUE',
      boutique.id,
      4,
    );
    await creerUtilisateur('respcrm-achats', 'RESPONSABLE_CRM', null, 1);
    await creerUtilisateur(
      'respbout-achats',
      'RESPONSABLE_BOUTIQUE',
      boutique.id,
      3,
    );

    const produit = await env.prisma.produit.create({
      data: { designation: 'Coque Achats', prixUnitaire: '2500.00', stock: 0 },
    });
    produitId = produit.id;
    await env.prisma.stockQuant.create({
      data: { produitId: produit.id, entrepotId, quantite: 0 },
    });

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

    tokens.respsi = await login('respsi-achats');
    tokens.daf = await login('daf-achats');
    tokens.central = await login('central-achats');
    tokens.caissier = await login('caissier-achats');
    tokens.respcrm = await login('respcrm-achats');
    tokens.respboutique = await login('respbout-achats');

    const f = await request(app.getHttpServer())
      .post('/fournisseurs')
      .set(auth(tokens.respsi))
      .send({ nom: 'Grossiste Cycle Achats' })
      .expect(201);
    fournisseurId = (f.body as { id: string }).id;
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse (403) commande / facture / lecture par RESPONSABLE_CRM', async () => {
    await request(app.getHttpServer())
      .get('/achats/commandes')
      .set(auth(tokens.respcrm))
      .expect(403);
    await request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.respcrm))
      .send({
        fournisseurId,
        lignes: [{ produitId, quantite: 1, prixUnitaire: 100 }],
      })
      .expect(403);
    await request(app.getHttpServer())
      .get('/achats/factures')
      .set(auth(tokens.respcrm))
      .expect(403);
  });

  it('refuse (403) la lecture commandes / factures par CAISSIER_BOUTIQUE', async () => {
    await request(app.getHttpServer())
      .get('/achats/commandes')
      .set(auth(tokens.caissier))
      .expect(403);
    await request(app.getHttpServer())
      .get('/achats/factures')
      .set(auth(tokens.caissier))
      .expect(403);
    await request(app.getHttpServer())
      .get('/fournisseurs')
      .set(auth(tokens.caissier))
      .expect(403);
  });

  it('refuse (403) la création de commande par CAISSIER_BOUTIQUE', () => {
    return request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.caissier))
      .send({
        fournisseurId,
        lignes: [{ produitId, quantite: 4, prixUnitaire: 900 }],
      })
      .expect(403);
  });

  it('refuse la réception et l’annulation hors machine à états, puis déroule le cycle complet', async () => {
    const created = await request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.respsi))
      .send({
        fournisseurId,
        lignes: [{ produitId, quantite: 10, prixUnitaire: 900 }],
      })
      .expect(201);
    const commande = created.body as {
      id: string;
      statut: string;
      lignes: Array<{ id: string; quantiteRestante: number }>;
    };
    expect(commande.statut).toBe('BROUILLON');
    const ligneId = commande.lignes[0].id;

    await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.respsi))
      .send({
        produitId,
        quantite: 2,
        prixAchat: 900,
        entrepotId,
        ligneCommandeId: ligneId,
      })
      .expect(400);

    const confirmee = await request(app.getHttpServer())
      .post(`/achats/commandes/${commande.id}/confirmer`)
      .set(auth(tokens.respsi))
      .expect(201);
    expect((confirmee.body as { statut: string }).statut).toBe('CONFIRMEE');

    const auditConfirm = await env.prisma.journalAudit.findFirst({
      where: {
        entite: 'CommandeAchat',
        entiteId: commande.id,
        action: 'COMMANDE_ACHAT_CONFIRMEE',
      },
    });
    expect(auditConfirm).not.toBeNull();

    const partiel = await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.respsi))
      .send({
        produitId,
        quantite: 4,
        prixAchat: 900,
        entrepotId,
        ligneCommandeId: ligneId,
        reference: 'BL-ACHATS-1',
      })
      .expect(201);
    expect((partiel.body as { quantite: number }).quantite).toBe(4);

    const apresPartiel = await request(app.getHttpServer())
      .get(`/achats/commandes/${commande.id}`)
      .set(auth(tokens.daf))
      .expect(200);
    expect((apresPartiel.body as { statut: string }).statut).toBe(
      'PARTIELLEMENT_RECEPTIONNEE',
    );

    await request(app.getHttpServer())
      .post(`/achats/commandes/${commande.id}/annuler`)
      .set(auth(tokens.respsi))
      .expect(400);

    await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.respsi))
      .send({
        produitId,
        quantite: 20,
        prixAchat: 900,
        entrepotId,
        ligneCommandeId: ligneId,
      })
      .expect(400);

    const reste = await request(app.getHttpServer())
      .post(`/fournisseurs/${fournisseurId}/receptions`)
      .set(auth(tokens.respsi))
      .send({
        produitId,
        quantite: 6,
        prixAchat: 950,
        entrepotId,
        ligneCommandeId: ligneId,
      })
      .expect(201);
    const receptionIds = [
      (partiel.body as { id: string }).id,
      (reste.body as { id: string }).id,
    ];

    const complete = await request(app.getHttpServer())
      .get(`/achats/commandes/${commande.id}`)
      .set(auth(tokens.daf))
      .expect(200);
    expect((complete.body as { statut: string }).statut).toBe('RECEPTIONNEE');

    await request(app.getHttpServer())
      .post('/achats/factures')
      .set(auth(tokens.caissier))
      .send({ fournisseurId, receptionIds })
      .expect(403);

    const brouillon = await request(app.getHttpServer())
      .post('/achats/factures')
      .set(auth(tokens.respsi))
      .send({
        fournisseurId,
        receptionIds,
        referenceFournisseur: 'FA-2026-001',
      })
      .expect(201);
    const factureId = (brouillon.body as { id: string; montant: string }).id;
    expect(Number((brouillon.body as { montant: string }).montant)).toBe(
      4 * 900 + 6 * 950,
    );

    const ficheCommande = await request(app.getHttpServer())
      .get(`/achats/commandes/${commande.id}`)
      .set(auth(tokens.daf))
      .expect(200);
    const ficheBody = ficheCommande.body as {
      receptions: Array<{ id: string; facture: { id: string } | null }>;
      factures: Array<{ id: string; numero: string }>;
    };
    expect(ficheBody.receptions).toHaveLength(2);
    expect(ficheBody.receptions.every((r) => r.facture?.id === factureId)).toBe(
      true,
    );
    expect(ficheBody.factures.map((f) => f.id)).toEqual([factureId]);

    const ficheFacture = await request(app.getHttpServer())
      .get(`/achats/factures/${factureId}`)
      .set(auth(tokens.daf))
      .expect(200);
    const lignesFacture = (
      ficheFacture.body as {
        lignes: Array<{
          commande: { id: string; numero: string } | null;
          dateReception: string;
        }>;
      }
    ).lignes;
    expect(lignesFacture).toHaveLength(2);
    expect(lignesFacture.every((l) => l.commande?.id === commande.id)).toBe(
      true,
    );
    expect(lignesFacture.every((l) => Boolean(l.dateReception))).toBe(true);

    await request(app.getHttpServer())
      .post('/achats/factures')
      .set(auth(tokens.respsi))
      .send({ fournisseurId, receptionIds })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/achats/factures/${factureId}/paiements`)
      .set(auth(tokens.daf))
      .send({ montant: 100, mode: 'VIREMENT' })
      .expect(400);

    const compta = await request(app.getHttpServer())
      .post(`/achats/factures/${factureId}/comptabiliser`)
      .set(auth(tokens.daf))
      .expect(201);
    expect((compta.body as { statut: string }).statut).toBe('COMPTABILISEE');

    await request(app.getHttpServer())
      .post(`/achats/factures/${factureId}/paiements`)
      .set(auth(tokens.respsi))
      .send({ montant: 1000, mode: 'VIREMENT' })
      .expect(403);
    await request(app.getHttpServer())
      .post(`/achats/factures/${factureId}/paiements`)
      .set(auth(tokens.caissier))
      .send({ montant: 1000, mode: 'VIREMENT' })
      .expect(403);

    const partielPaye = await request(app.getHttpServer())
      .post(`/achats/factures/${factureId}/paiements`)
      .set(auth(tokens.daf))
      .send({ montant: 2000, mode: 'VIREMENT', reference: 'VIR-1' })
      .expect(201);
    expect((partielPaye.body as { statut: string }).statut).toBe(
      'PARTIELLEMENT_PAYEE',
    );

    await request(app.getHttpServer())
      .post(`/achats/factures/${factureId}/paiements`)
      .set(auth(tokens.central))
      .send({ montant: 999999, mode: 'ESPECES' })
      .expect(400);

    const solde = await request(app.getHttpServer())
      .post(`/achats/factures/${factureId}/paiements`)
      .set(auth(tokens.central))
      .send({ montant: 4 * 900 + 6 * 950 - 2000, mode: 'ESPECES' })
      .expect(201);
    expect((solde.body as { statut: string }).statut).toBe('PAYEE');
    expect(Number((solde.body as { resteAPayer: string }).resteAPayer)).toBe(0);

    const synthese = await request(app.getHttpServer())
      .get('/fournisseurs/synthese')
      .set(auth(tokens.daf))
      .expect(200);
    const kpis = (synthese.body as { kpis: { encours: string } }).kpis;
    expect(kpis.encours).toBeDefined();

    const cloturee = await request(app.getHttpServer())
      .post(`/achats/commandes/${commande.id}/cloturer`)
      .set(auth(tokens.respsi))
      .expect(201);
    expect((cloturee.body as { statut: string }).statut).toBe('CLOTUREE');
  });

  it('autorise RESPONSABLE_BOUTIQUE à créer et confirmer une commande de sa boutique', async () => {
    const created = await request(app.getHttpServer())
      .post('/achats/commandes')
      .set(auth(tokens.respboutique))
      .send({
        fournisseurId,
        lignes: [{ produitId, quantite: 2, prixUnitaire: 800 }],
      })
      .expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/achats/commandes/${id}/confirmer`)
      .set(auth(tokens.respboutique))
      .expect(201);
  });
});
