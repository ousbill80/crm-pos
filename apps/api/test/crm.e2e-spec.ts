// Test d'intégration réel (zéro mock) — CRM (§6.6 du cahier des charges) :
// fiche client unique consolidée réseau, historique d'achats en lecture
// seule, segmentation, programme de fidélité par paliers, interactions CRM,
// et la matrice RBAC documentée dans src/crm/crm-roles.constants.ts.
// Démarre un vrai PostgreSQL via Testcontainers (voir CLAUDE.md — zéro
// donnée mockée, y compris en test).
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import type { RoleLibelle } from '@caisse-crm/shared';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

// Corps de réponse typés (supertest ne type pas `response.body`) — évite les
// accès `any` non sûrs (règle @typescript-eslint/no-unsafe-member-access).
interface LoginResponseBody {
  accessToken: string;
}
interface ClientResponseBody {
  id: string;
  segment: string;
  consentementMarketing: boolean;
}
interface FideliteResponseBody {
  pointsCumules: number;
  niveau: string;
}
interface VenteResponseBody {
  montantTotal: string;
}
interface InteractionResponseBody {
  canal: string;
}
interface ErrorResponseBody {
  message: string | string[];
}

function body<T>(response: request.Response): T {
  return response.body as T;
}

describe('CRM (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  // Un utilisateur par rôle du référentiel (§4), pour couvrir la matrice
  // RBAC du module CRM.
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
      const login = `${libelle.toLowerCase()}.test`;
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
          login: `${libelle.toLowerCase()}.test`,
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
  // Fiche client — création (§6.6)
  // ---------------------------------------------------------------------

  describe('Création de fiche client', () => {
    it('autorise un caissier boutique à créer un client (accueil en boutique)', async () => {
      const response = await request(app.getHttpServer())
        .post('/crm/clients')
        .set('Authorization', authHeader('CAISSIER_BOUTIQUE'))
        .send({ nom: 'Traoré', prenom: 'Awa', contact: '0700000001' })
        .expect(201);

      const client = body<ClientResponseBody>(response);
      expect(client.id).toEqual(expect.any(String));
      expect(client.segment).toBe('NOUVEAU');
    });

    it('autorise le Responsable CRM à créer un client', async () => {
      await request(app.getHttpServer())
        .post('/crm/clients')
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .send({ nom: 'Koné', prenom: 'Ibrahim' })
        .expect(201);
    });

    it('refuse explicitement (403) la création à un rôle non habilité (RESPONSABLE_SI)', async () => {
      await request(app.getHttpServer())
        .post('/crm/clients')
        .set('Authorization', authHeader('RESPONSABLE_SI'))
        .send({ nom: 'Diarra', prenom: 'Fatou' })
        .expect(403);
    });

    it('refuse explicitement (403) la création à un rôle de consultation réseau (DIRECTION_GENERALE)', async () => {
      await request(app.getHttpServer())
        .post('/crm/clients')
        .set('Authorization', authHeader('DIRECTION_GENERALE'))
        .send({ nom: 'Sanogo', prenom: 'Moussa' })
        .expect(403);
    });

    it('crée une entrée d’audit horodatée pour la création du client', async () => {
      const response = await request(app.getHttpServer())
        .post('/crm/clients')
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .send({ nom: 'Bamba', prenom: 'Aïcha' })
        .expect(201);

      const client = body<ClientResponseBody>(response);
      const entree = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'Client',
          entiteId: client.id,
          action: 'CLIENT_CREE',
        },
      });
      expect(entree).not.toBeNull();
      expect(entree?.utilisateurId).toBe(userIds.RESPONSABLE_CRM);
      expect(entree?.dateHeure).toBeInstanceOf(Date);
    });

    it('inscrit automatiquement le client au programme de fidélité (palier BRONZE, 0 point)', async () => {
      const response = await request(app.getHttpServer())
        .post('/crm/clients')
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .send({ nom: 'Ouattara', prenom: 'Salif' })
        .expect(201);

      const client = body<ClientResponseBody>(response);
      const fideliteResponse = await request(app.getHttpServer())
        .get(`/crm/clients/${client.id}/fidelite`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);

      const fidelite = body<FideliteResponseBody>(fideliteResponse);
      expect(fidelite.pointsCumules).toBe(0);
      expect(fidelite.niveau).toBe('BRONZE');
    });
  });

  // ---------------------------------------------------------------------
  // Lecture réseau et interdiction d'accès (§6.6, fiche consolidée réseau)
  // ---------------------------------------------------------------------

  describe('Lecture de la fiche client consolidée réseau', () => {
    let clientId: string;

    beforeAll(async () => {
      const client = await env.prisma.client.create({
        data: { nom: 'Coulibaly', prenom: 'Boubacar' },
      });
      clientId = client.id;
    });

    it.each<RoleLibelle>([
      'RESPONSABLE_CRM',
      'DIRECTION_GENERALE',
      'DAF',
      'CAISSIER_CENTRAL',
      'CONTROLEUR_INTERNE',
      'SUPERVISEUR_ZONE',
      'RESPONSABLE_BOUTIQUE',
      'CAISSIER_BOUTIQUE',
    ])(
      'autorise le rôle %s à consulter un client (accès réseau, non scopé boutique)',
      async (role) => {
        await request(app.getHttpServer())
          .get(`/crm/clients/${clientId}`)
          .set('Authorization', authHeader(role))
          .expect(200);
      },
    );

    it('refuse explicitement (403), sans juste masquer un bouton, l’accès en lecture à RESPONSABLE_SI', async () => {
      const response = await request(app.getHttpServer())
        .get(`/crm/clients/${clientId}`)
        .set('Authorization', authHeader('RESPONSABLE_SI'))
        .expect(403);
      const erreur = body<ErrorResponseBody>(response);
      expect(erreur.message).toEqual(expect.anything());
    });

    it('liste les clients sans filtre pour un rôle de lecture réseau', async () => {
      const response = await request(app.getHttpServer())
        .get('/crm/clients')
        .set('Authorization', authHeader('DIRECTION_GENERALE'))
        .expect(200);
      const clients = body<ClientResponseBody[]>(response);
      expect(Array.isArray(clients)).toBe(true);
      expect(clients.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------
  // Modification de fiche client (segmentation incluse) — admin CRM only
  // ---------------------------------------------------------------------

  describe('Modification de fiche client', () => {
    let clientId: string;

    beforeAll(async () => {
      const client = await env.prisma.client.create({
        data: { nom: 'Sidibé', prenom: 'Mariam' },
      });
      clientId = client.id;
    });

    it('refuse la modification (403) à un rôle de lecture seule (CONTROLEUR_INTERNE)', async () => {
      await request(app.getHttpServer())
        .patch(`/crm/clients/${clientId}`)
        .set('Authorization', authHeader('CONTROLEUR_INTERNE'))
        .send({ segment: 'VIP' })
        .expect(403);
    });

    it('refuse la modification (403) à un rôle boutique (CAISSIER_BOUTIQUE) — création seule autorisée', async () => {
      await request(app.getHttpServer())
        .patch(`/crm/clients/${clientId}`)
        .set('Authorization', authHeader('CAISSIER_BOUTIQUE'))
        .send({ segment: 'VIP' })
        .expect(403);
    });

    it('autorise le Responsable CRM à modifier la segmentation et journalise l’action', async () => {
      const response = await request(app.getHttpServer())
        .patch(`/crm/clients/${clientId}`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .send({ segment: 'VIP', consentementMarketing: true })
        .expect(200);

      const client = body<ClientResponseBody>(response);
      expect(client.segment).toBe('VIP');
      expect(client.consentementMarketing).toBe(true);

      const entree = await env.prisma.journalAudit.findFirst({
        where: {
          entite: 'Client',
          entiteId: clientId,
          action: 'CLIENT_MODIFIE',
        },
      });
      expect(entree).not.toBeNull();
    });

    it('renvoie 404 pour un client inexistant', async () => {
      await request(app.getHttpServer())
        .patch('/crm/clients/00000000-0000-0000-0000-000000000000')
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .send({ segment: 'VIP' })
        .expect(404);
    });
  });

  // ---------------------------------------------------------------------
  // Historique d'achats (lecture seule — §6.6)
  // ---------------------------------------------------------------------

  describe('Historique d’achats réseau', () => {
    let clientAvecAchatsId: string;
    let clientSansAchatsId: string;
    let caisseId: string;

    beforeAll(async () => {
      const zone = await env.prisma.zone.create({
        data: { nomZone: 'Zone Test CRM' },
      });
      const boutique = await env.prisma.boutique.create({
        data: {
          nom: 'Boutique Test CRM',
          adresse: 'Marché des Accessoires',
          zoneId: zone.id,
        },
      });
      const caisse = await env.prisma.caisse.create({
        data: { type: 'AUXILIAIRE', boutiqueId: boutique.id },
      });
      caisseId = caisse.id;

      const clientAvecAchats = await env.prisma.client.create({
        data: { nom: 'Keita', prenom: 'Seydou' },
      });
      clientAvecAchatsId = clientAvecAchats.id;

      const clientSansAchats = await env.prisma.client.create({
        data: { nom: 'Diallo', prenom: 'Ramata' },
      });
      clientSansAchatsId = clientSansAchats.id;

      // Deux ventes rattachées au client.
      await env.prisma.vente.create({
        data: {
          montantTotal: '15000.00',
          caisseId,
          clientId: clientAvecAchatsId,
        },
      });
      await env.prisma.vente.create({
        data: {
          montantTotal: '5000.00',
          caisseId,
          clientId: clientAvecAchatsId,
        },
      });

      // Vente anonyme (rattachement client optionnel — §6.6) : ne doit
      // apparaître dans l'historique d'aucun client et ne doit rien casser.
      await env.prisma.vente.create({
        data: { montantTotal: '2500.00', caisseId, clientId: null },
      });
    });

    it('agrège correctement les ventes d’un client', async () => {
      const response = await request(app.getHttpServer())
        .get(`/crm/clients/${clientAvecAchatsId}/historique-achats`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);

      const ventes = body<VenteResponseBody[]>(response);
      expect(ventes).toHaveLength(2);
      const total = ventes.reduce(
        (sum, vente) => sum + Number(vente.montantTotal),
        0,
      );
      expect(total).toBe(20000);
    });

    it('renvoie un historique vide pour un client sans achat, sans planter', async () => {
      const response = await request(app.getHttpServer())
        .get(`/crm/clients/${clientSansAchatsId}/historique-achats`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);

      expect(body<VenteResponseBody[]>(response)).toEqual([]);
    });

    it('la vente anonyme n’apparaît dans l’historique d’aucun client', async () => {
      const responseAvecAchats = await request(app.getHttpServer())
        .get(`/crm/clients/${clientAvecAchatsId}/historique-achats`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);
      const responseSansAchats = await request(app.getHttpServer())
        .get(`/crm/clients/${clientSansAchatsId}/historique-achats`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(200);

      const ventesAvecAchats = body<VenteResponseBody[]>(responseAvecAchats);
      const ventesSansAchats = body<VenteResponseBody[]>(responseSansAchats);
      const montants = [...ventesAvecAchats, ...ventesSansAchats].map((v) =>
        Number(v.montantTotal),
      );
      expect(montants).not.toContain(2500);

      const venteAnonyme = await env.prisma.vente.findFirst({
        where: { clientId: null },
      });
      expect(venteAnonyme).not.toBeNull();
    });

    it('refuse explicitement (403) la consultation de l’historique à RESPONSABLE_SI', async () => {
      await request(app.getHttpServer())
        .get(`/crm/clients/${clientAvecAchatsId}/historique-achats`)
        .set('Authorization', authHeader('RESPONSABLE_SI'))
        .expect(403);
    });

    it('recalcule le segment sur la base du nombre de ventes historisées', async () => {
      // Seuil REGULIER = 5 ventes (crm-thresholds.constants.ts) : on ajoute
      // 3 ventes supplémentaires pour atteindre 5 au total.
      for (let i = 0; i < 3; i += 1) {
        await env.prisma.vente.create({
          data: {
            montantTotal: '1000.00',
            caisseId,
            clientId: clientAvecAchatsId,
          },
        });
      }

      await request(app.getHttpServer())
        .post(`/crm/clients/${clientAvecAchatsId}/segment/recalculer`)
        .set('Authorization', authHeader('CAISSIER_BOUTIQUE'))
        .expect(403);

      const response = await request(app.getHttpServer())
        .post(`/crm/clients/${clientAvecAchatsId}/segment/recalculer`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .expect(201);

      expect(body<ClientResponseBody>(response).segment).toBe('REGULIER');
    });
  });

  // ---------------------------------------------------------------------
  // Fidélité — points et paliers (§6.6)
  // ---------------------------------------------------------------------

  describe('Programme de fidélité', () => {
    let clientId: string;

    beforeAll(async () => {
      const client = await env.prisma.client.create({
        data: { nom: 'Touré', prenom: 'Adama' },
      });
      await env.prisma.fidelite.create({
        data: { clientId: client.id, pointsCumules: 0, niveau: 'BRONZE' },
      });
      clientId = client.id;
    });

    it('refuse (403) le crédit de points à un rôle boutique', async () => {
      await request(app.getHttpServer())
        .post(`/crm/clients/${clientId}/fidelite/points`)
        .set('Authorization', authHeader('CAISSIER_BOUTIQUE'))
        .send({ points: 100 })
        .expect(403);
    });

    it('crédite des points et fait passer le client au palier ARGENT au seuil de 500 points', async () => {
      const response = await request(app.getHttpServer())
        .post(`/crm/clients/${clientId}/fidelite/points`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .send({ points: 600, motif: 'Achat important' })
        .expect(201);

      const fidelite = body<FideliteResponseBody>(response);
      expect(fidelite.pointsCumules).toBe(600);
      expect(fidelite.niveau).toBe('ARGENT');
    });

    it('cumule les points sur les crédits successifs et fait passer au palier OR au seuil de 2000 points', async () => {
      const response = await request(app.getHttpServer())
        .post(`/crm/clients/${clientId}/fidelite/points`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .send({ points: 1500 })
        .expect(201);

      const fidelite = body<FideliteResponseBody>(response);
      expect(fidelite.pointsCumules).toBe(2100);
      expect(fidelite.niveau).toBe('OR');
    });

    it('journalise chaque crédit de points', async () => {
      const entrees = await env.prisma.journalAudit.findMany({
        where: { entite: 'Fidelite', action: 'FIDELITE_POINTS_CREDITES' },
      });
      expect(entrees.length).toBeGreaterThanOrEqual(2);
    });

    it('rejette un crédit de points négatif ou nul', async () => {
      await request(app.getHttpServer())
        .post(`/crm/clients/${clientId}/fidelite/points`)
        .set('Authorization', authHeader('RESPONSABLE_CRM'))
        .send({ points: 0 })
        .expect(400);
    });
  });

  // ---------------------------------------------------------------------
  // Interactions CRM (§6.6)
  // ---------------------------------------------------------------------

  describe('Interactions CRM', () => {
    let clientId: string;

    beforeAll(async () => {
      const client = await env.prisma.client.create({
        data: { nom: 'Cissé', prenom: 'Modibo' },
      });
      clientId = client.id;
    });

    it('autorise un responsable boutique à consigner une interaction (ex: visite)', async () => {
      const response = await request(app.getHttpServer())
        .post(`/crm/clients/${clientId}/interactions`)
        .set('Authorization', authHeader('RESPONSABLE_BOUTIQUE'))
        .send({
          type: 'VISITE_BOUTIQUE',
          canal: 'VISITE',
          contenu: 'Passage en boutique',
        })
        .expect(201);

      expect(body<InteractionResponseBody>(response).canal).toBe('VISITE');
    });

    it('refuse (403) la création d’interaction à un rôle de lecture seule réseau', async () => {
      await request(app.getHttpServer())
        .post(`/crm/clients/${clientId}/interactions`)
        .set('Authorization', authHeader('CONTROLEUR_INTERNE'))
        .send({ type: 'APPEL_SUIVI', canal: 'APPEL' })
        .expect(403);
    });

    it('liste les interactions d’un client pour un rôle de lecture réseau', async () => {
      const response = await request(app.getHttpServer())
        .get(`/crm/clients/${clientId}/interactions`)
        .set('Authorization', authHeader('DAF'))
        .expect(200);

      expect(
        body<InteractionResponseBody[]>(response).length,
      ).toBeGreaterThanOrEqual(1);
    });
  });
});
