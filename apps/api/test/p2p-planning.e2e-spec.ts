import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const PASSWORD = 'MotDePasse!123';
process.env.JWT_SECRET ??= 'test-secret-e2e';

describe('P2P planning/sourcing (e2e PostgreSQL)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let achatsToken: string;
  let dafToken: string;
  let caissierToken: string;
  let centreCoutId: string;
  let produitId: string;
  let budgetId: string;
  let boutiqueId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function creerUtilisateur(
    login: string,
    roleLibelle: string,
    boutiqueId: string | null,
  ) {
    const role = await env.prisma.role.upsert({
      where: { libelle: roleLibelle },
      update: {},
      create: { libelle: roleLibelle, niveauHabilitation: 1 },
    });
    await env.prisma.utilisateur.create({
      data: {
        login,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        nom: 'P2P',
        prenom: login,
        roleId: role.id,
        boutiqueId,
      },
    });
    return role;
  }

  async function login(loginValue: string) {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ login: loginValue, password: PASSWORD })
      .expect(200);
    return (response.body as { accessToken: string }).accessToken;
  }

  function creerDemande(
    montant: number,
    clientOperationId = crypto.randomUUID(),
  ) {
    return request(app.getHttpServer())
      .post('/achats/demandes')
      .set(auth(achatsToken))
      .send({
        clientOperationId,
        objet: 'Réassort protections',
        justification: 'Demande e2e réelle',
        centreCoutId,
        budgetId,
        boutiqueId,
        devise: 'XOF',
        lignes: [
          {
            produitId,
            designation: 'Protection test',
            quantite: 1,
            prixEstime: montant,
          },
        ],
      });
  }

  beforeAll(async () => {
    await env.start();
    const zone = await env.prisma.zone.create({ data: { nomZone: 'P2P' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Boutique P2P', adresse: 'Test', zoneId: zone.id },
    });
    boutiqueId = boutique.id;
    const societe = await env.prisma.societe.create({
      data: { raisonSociale: 'P2P Test', adresse: 'Test' },
    });
    const centre = await env.prisma.centreCout.create({
      data: {
        societeId: societe.id,
        code: 'P2P',
        libelle: 'Planning',
        boutiqueId: boutique.id,
      },
    });
    centreCoutId = centre.id;
    const budget = await env.prisma.budgetAchat.create({
      data: {
        centreCoutId,
        libelle: 'Budget e2e',
        devise: 'XOF',
        montantAlloue: '1000',
        dateDebut: new Date('2026-01-01'),
        dateFin: new Date('2026-12-31'),
      },
    });
    budgetId = budget.id;
    const produit = await env.prisma.produit.create({
      data: { designation: 'Protection test', prixUnitaire: '2000' },
    });
    produitId = produit.id;

    await creerUtilisateur('achats-planning', 'ACHATS', null);
    await creerUtilisateur('daf-planning', 'DAF', null);
    await creerUtilisateur(
      'caissier-planning',
      'CAISSIER_BOUTIQUE',
      boutique.id,
    );

    const moduleFixture = await Test.createTestingModule({
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
    achatsToken = await login('achats-planning');
    dafToken = await login('daf-planning');
    caissierToken = await login('caissier-planning');
  }, 120_000);

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('refuse explicitement les rôles hors planning', async () => {
    await request(app.getHttpServer())
      .get('/achats/demandes')
      .set(auth(caissierToken))
      .expect(403);
    await request(app.getHttpServer())
      .post('/achats/demandes')
      .set(auth(caissierToken))
      .send({})
      .expect(403);
  });

  it('retourne la même demande pour un clientOperationId rejoué', async () => {
    const operationId = crypto.randomUUID();
    const first = await creerDemande(100, operationId).expect(201);
    const second = await creerDemande(100, operationId).expect(201);
    expect((second.body as { id: string }).id).toBe(
      (first.body as { id: string }).id,
    );
    expect(
      await env.prisma.demandeAchat.count({
        where: { clientOperationId: operationId },
      }),
    ).toBe(1);
  });

  it('refuse l’approbation sans règle configurée et les transitions invalides', async () => {
    const created = await creerDemande(100).expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/achats/demandes/${id}/approuver`)
      .set(auth(dafToken))
      .expect(400);
    await request(app.getHttpServer())
      .post(`/achats/demandes/${id}/soumettre`)
      .set(auth(achatsToken))
      .expect(201);
    await request(app.getHttpServer())
      .post(`/achats/demandes/${id}/soumettre`)
      .set(auth(achatsToken))
      .expect(400);
    await request(app.getHttpServer())
      .post(`/achats/demandes/${id}/approuver`)
      .set(auth(dafToken))
      .expect(400);
  });

  it('refuse un engagement dépassant l’enveloppe budgétaire', async () => {
    const dafRole = await env.prisma.role.findUniqueOrThrow({
      where: { libelle: 'DAF' },
    });
    const societeId = (
      await env.prisma.centreCout.findUniqueOrThrow({
        where: { id: centreCoutId },
      })
    ).societeId;
    await env.prisma.regleApprobationAchat.create({
      data: {
        societeId,
        niveau: 1,
        montantMin: '0',
        montantMax: null,
        devise: 'XOF',
        roleId: dafRole.id,
      },
    });
    const created = await creerDemande(1500).expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/achats/demandes/${id}/soumettre`)
      .set(auth(achatsToken))
      .expect(400);
    expect(
      await env.prisma.mouvementBudgetAchat.count({ where: { demandeId: id } }),
    ).toBe(0);
  });

  it('approuve selon la règle configurée et écrit engagement + audit append-only', async () => {
    const created = await creerDemande(500).expect(201);
    const id = (created.body as { id: string }).id;
    await request(app.getHttpServer())
      .post(`/achats/demandes/${id}/soumettre`)
      .set(auth(achatsToken))
      .expect(201);
    const approved = await request(app.getHttpServer())
      .post(`/achats/demandes/${id}/approuver`)
      .set(auth(dafToken))
      .expect(201);
    expect((approved.body as { statut: string }).statut).toBe('APPROUVEE');
    expect(
      await env.prisma.mouvementBudgetAchat.count({
        where: { demandeId: id, type: 'ENGAGEMENT' },
      }),
    ).toBe(1);
    expect(
      await env.prisma.journalAudit.count({
        where: {
          entite: 'DemandeAchat',
          entiteId: id,
          action: 'DEMANDE_ACHAT_APPROUVEE',
        },
      }),
    ).toBe(1);
  });
});
