// Compte client shop — isolation commandes (PLAN-E-COMMERCE Lot 8).
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

jest.setTimeout(120_000);

describe('Shop compte client (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;

  beforeAll(async () => {
    await env.start();
    const moduleFixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await env.stop();
  });

  it('inscription + login + commandes vides', async () => {
    const inscription = await request(app.getHttpServer())
      .post('/shop/compte/inscription')
      .send({
        email: 'client-a@test.local',
        password: 'Secret!12345',
        nom: 'Traore',
        prenom: 'Ousmane',
        telephone: '+2250700000000',
      })
      .expect(201);
    expect((inscription.body as { displayName: string }).displayName).toMatch(
      /Ousmane/i,
    );

    const login = await request(app.getHttpServer())
      .post('/shop/compte/login')
      .send({ email: 'client-a@test.local', password: 'Secret!12345' })
      .expect(201);

    const body = login.body as {
      accessToken: string;
      displayName: string;
      prenom: string;
    };
    expect(body.prenom).toBe('Ousmane');
    expect(body.displayName).toMatch(/Ousmane/i);

    const moi = await request(app.getHttpServer())
      .get('/shop/compte/moi')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect((moi.body as { prenom: string }).prenom).toBe('Ousmane');
    const code = (moi.body as { codeParrainage: string }).codeParrainage;
    expect(code).toMatch(/^MA[A-Z0-9]{6}$/);

    const filleul = await request(app.getHttpServer())
      .post('/shop/compte/inscription')
      .send({
        email: 'client-b@test.local',
        password: 'Secret!12345',
        nom: 'Kone',
        prenom: 'Awa',
        telephone: '+2250700000001',
        codeParrain: code,
      })
      .expect(201);
    const tokenFilleul = (filleul.body as { accessToken: string }).accessToken;
    const moiFilleul = await request(app.getHttpServer())
      .get('/shop/compte/moi')
      .set('Authorization', `Bearer ${tokenFilleul}`)
      .expect(200);
    expect((moiFilleul.body as { codeParrainage: string }).codeParrainage).not.toBe(
      code,
    );

    const moiParrain = await request(app.getHttpServer())
      .get('/shop/compte/moi')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect((moiParrain.body as { filleuls: number }).filleuls).toBe(1);

    const cmd = await request(app.getHttpServer())
      .get('/shop/compte/commandes')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect(Array.isArray(cmd.body)).toBe(true);
  });

  it('rattache une commande invité au compte (même e-mail) et enregistre une adresse', async () => {
    const zone = await env.prisma.zone.create({ data: { nomZone: 'ZC' } });
    const boutique = await env.prisma.boutique.create({
      data: { nom: 'Showroom', adresse: 'Cocody', zoneId: zone.id },
    });
    const entrepot = await env.prisma.entrepot.create({
      data: { nom: 'Web', code: 'WEB-COMPTE', boutiqueId: boutique.id },
    });
    const guestEmail = 'invite-compte@test.local';
    const commande = await env.prisma.commandeWeb.create({
      data: {
        clientOperationId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        statut: 'PREPARATION',
        modeFulfillment: 'LIVRAISON',
        modeReglement: 'PAIEMENT_LIVRAISON',
        entrepotId: entrepot.id,
        emailInvite: guestEmail,
        adresseLivraisonJson: {
          ligne1: 'Rue des Jardins',
          ville: 'Abidjan',
        },
        montantTotal: 25000,
      },
    });

    const inscription = await request(app.getHttpServer())
      .post('/shop/compte/inscription')
      .send({
        email: guestEmail,
        password: 'Secret!12345',
        nom: 'Kone',
        prenom: 'Awa',
        telephone: '+2250700112233',
      })
      .expect(201);
    const token = (inscription.body as { accessToken: string }).accessToken;

    const loginCase = await request(app.getHttpServer())
      .post('/shop/compte/login')
      .send({ email: 'Invite-Compte@test.local', password: 'Secret!12345' })
      .expect(201);
    expect((loginCase.body as { email: string }).email).toBe(guestEmail);

    const liste = await request(app.getHttpServer())
      .get('/shop/compte/commandes')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const ids = (liste.body as { id: string }[]).map((c) => c.id);
    expect(ids).toContain(commande.id);

    const rattachee = await env.prisma.commandeWeb.findUniqueOrThrow({
      where: { id: commande.id },
    });
    expect(rattachee.compteClientId).toBeTruthy();

    await request(app.getHttpServer())
      .post('/shop/compte/adresses')
      .set('Authorization', `Bearer ${token}`)
      .send({
        libelle: 'Domicile',
        ligne1: 'Riviera 2',
        ville: 'Abidjan',
        telephone: '+2250700112233',
        lat: 5.3456,
        lng: -3.9876,
      })
      .expect(201);

    const carnet = await request(app.getHttpServer())
      .get('/shop/compte/adresses')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const riviera = (
      carnet.body as { ligne1: string; lat: number | null }[]
    ).find((a) => a.ligne1 === 'Riviera 2');
    expect(riviera).toBeTruthy();
    expect(riviera?.lat).toBeCloseTo(5.3456, 4);
  });

  it('refuse commandes sans token', async () => {
    await request(app.getHttpServer())
      .get('/shop/compte/commandes')
      .expect(401);
  });
});
