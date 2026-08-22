// Diffusion WebSocket trésorerie §5.2 — connexion authentifiée, rooms
// périmètre §6.2, événement transaction.statut après transition.
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { TypeCaisse } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  TRANSACTION_STATUT_EVENT,
  type TransactionStatutPayload,
} from '../src/transactions/transactions.gateway';
import { PrismaService } from '../src/prisma/prisma.service';
import { PostgresTestEnvironment } from './utils/postgres-test-environment';

const MOT_DE_PASSE = 'MotDePasse!123';

process.env.JWT_SECRET ??= 'test-secret-e2e';

function attendreEvenement(
  socket: Socket,
  timeoutMs = 8_000,
): Promise<TransactionStatutPayload> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(TRANSACTION_STATUT_EVENT, onEvent);
      reject(new Error('Timeout en attente transaction.statut'));
    }, timeoutMs);

    function onEvent(payload: TransactionStatutPayload) {
      clearTimeout(timer);
      socket.off(TRANSACTION_STATUT_EVENT, onEvent);
      resolve(payload);
    }

    socket.on(TRANSACTION_STATUT_EVENT, onEvent);
  });
}

describe('TransactionsGateway — WebSocket trésorerie §5.2 (e2e)', () => {
  const env = new PostgresTestEnvironment();
  let app: INestApplication<App>;
  let baseUrl: string;

  let zoneAId: string;
  let boutique1Id: string;
  let caisseBoutique1Id: string;

  const tokens: Record<string, string> = {};

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
  ): Promise<void> {
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

  beforeAll(async () => {
    await env.start();

    const zoneA = await env.prisma.zone.create({
      data: { nomZone: 'Zone WS' },
    });
    zoneAId = zoneA.id;
    const boutique1 = await env.prisma.boutique.create({
      data: { nom: 'Boutique WS', adresse: 'Adresse WS', zoneId: zoneA.id },
    });
    boutique1Id = boutique1.id;

    const caisseBoutique1 = await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique1Id },
    });
    caisseBoutique1Id = caisseBoutique1.id;

    await creerUtilisateur('resp-ws', 'RESPONSABLE_BOUTIQUE', boutique1Id, 3);
    await creerUtilisateur('central-ws', 'CAISSIER_CENTRAL', null, 1);
    await creerUtilisateur('super-ws', 'SUPERVISEUR_ZONE', boutique1Id, 2);
    await creerUtilisateur('caissier-ws', 'CAISSIER_BOUTIQUE', boutique1Id, 4);

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
    await app.listen(0);
    const server = app.getHttpServer() as import('node:net').Server;
    const address = server.address();
    const port =
      typeof address === 'object' && address !== null ? address.port : 3000;
    baseUrl = `http://127.0.0.1:${port}`;

    tokens.resp = await login('resp-ws');
    tokens.central = await login('central-ws');
    tokens.superviseur = await login('super-ws');
    tokens.caissier = await login('caissier-ws');
  }, 120_000);

  afterAll(async () => {
    if (app) await app.close();
    await env.stop();
  });

  it('refuse une connexion sans token JWT (déconnexion après handshake)', async () => {
    const socket = io(`${baseUrl}/tresorerie`, {
      transports: ['websocket'],
      reconnection: false,
    });

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Connexion non refusée (pas de disconnect)')),
        5_000,
      );
      socket.on('disconnect', () => {
        clearTimeout(timer);
        resolve();
      });
    });

    socket.disconnect();
  });

  it('émet transaction.statut au réseau et à la boutique après transition §6.4', async () => {
    const socketCentral = io(`${baseUrl}/tresorerie`, {
      auth: { token: tokens.central },
      transports: ['websocket'],
    });
    const socketBoutique = io(`${baseUrl}/tresorerie`, {
      auth: { token: tokens.resp },
      transports: ['websocket'],
    });

    await Promise.all([
      new Promise<void>((resolve, reject) => {
        socketCentral.once('connect', () => resolve());
        socketCentral.once('connect_error', reject);
      }),
      new Promise<void>((resolve, reject) => {
        socketBoutique.once('connect', () => resolve());
        socketBoutique.once('connect_error', reject);
      }),
    ]);

    const attenteCentral = attendreEvenement(socketCentral);
    const attenteBoutique = attendreEvenement(socketBoutique);

    const created = await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${tokens.resp}`)
      .send({ caisseId: caisseBoutique1Id, type: 'SORTIE_FONDS', montant: 500 })
      .expect(201);
    const transaction = created.body as { id: string; statut: string };

    const [payloadCentral, payloadBoutique] = await Promise.all([
      attenteCentral,
      attenteBoutique,
    ]);

    expect(payloadCentral.id).toBe(transaction.id);
    expect(payloadCentral.statut).toBe('INITIEE');
    expect(payloadCentral.boutiqueId).toBe(boutique1Id);
    expect(payloadCentral.zoneId).toBe(zoneAId);
    expect(payloadBoutique).toEqual(payloadCentral);

    socketCentral.disconnect();
    socketBoutique.disconnect();
  });

  it('le superviseur de zone reçoit les événements de sa zone', async () => {
    const socketSuper = io(`${baseUrl}/tresorerie`, {
      auth: { token: tokens.superviseur },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      socketSuper.once('connect', () => resolve());
      socketSuper.once('connect_error', reject);
    });

    const attente = attendreEvenement(socketSuper);
    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${tokens.resp}`)
      .send({ caisseId: caisseBoutique1Id, type: 'SORTIE_FONDS', montant: 750 })
      .expect(201);

    const payload = await attente;
    expect(payload.zoneId).toBe(zoneAId);
    socketSuper.disconnect();
  });

  it('un caissier boutique ne reçoit pas les événements d’une autre boutique', async () => {
    const boutique2 = await env.prisma.boutique.create({
      data: { nom: 'Autre boutique', adresse: 'Autre', zoneId: zoneAId },
    });
    await env.prisma.caisse.create({
      data: { type: TypeCaisse.MAGASIN, boutiqueId: boutique2.id },
    });
    await creerUtilisateur(
      'resp-autre',
      'RESPONSABLE_BOUTIQUE',
      boutique2.id,
      3,
    );
    const tokenAutre = await login('resp-autre');

    const socketAutre = io(`${baseUrl}/tresorerie`, {
      auth: { token: tokenAutre },
      transports: ['websocket'],
    });
    await new Promise<void>((resolve, reject) => {
      socketAutre.once('connect', () => resolve());
      socketAutre.once('connect_error', reject);
    });

    let recu = false;
    socketAutre.on(TRANSACTION_STATUT_EVENT, () => {
      recu = true;
    });

    await request(app.getHttpServer())
      .post('/transactions')
      .set('Authorization', `Bearer ${tokens.resp}`)
      .send({ caisseId: caisseBoutique1Id, type: 'SORTIE_FONDS', montant: 100 })
      .expect(201);

    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(recu).toBe(false);
    socketAutre.disconnect();
  });
});
