import {
  ConnectedSocket,
  OnGatewayConnection,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import type { JwtPayload } from '../auth/types';
import {
  ROLES_PERIMETRE_BOUTIQUE,
  ROLES_RESEAU_TRESORERIE,
  ROLE_SUPERVISEUR_ZONE,
} from '../caisses/access-scope.constants';
import { PrismaService } from '../prisma/prisma.service';

export const TRANSACTION_STATUT_EVENT = 'transaction.statut';
export const ALERTE_NOUVELLE_EVENT = 'alerte.nouvelle';

export interface TransactionStatutPayload {
  id: string;
  statut: string;
  type: string;
  montant: string;
  caisseId: string;
  boutiqueId: string | null;
  zoneId: string | null;
}

// Notification proactive (§6.7, §5.1) — diffusée par AlertesSchedulerService.
export interface AlerteRealtimePayload {
  type: string;
  severite: string;
  message: string;
  dateHeure: string;
  entite: string;
  entiteId: string;
  details?: Record<string, unknown>;
}

// Diffusion temps réel des changements de statut (§5.2) : rooms
// `reseau`, `zone:{id}`, `boutique:{id}` selon le périmètre §6.2.
@WebSocketGateway({
  cors: { origin: true },
  namespace: '/tresorerie',
})
export class TransactionsGateway implements OnGatewayConnection {
  private readonly logger = new Logger(TransactionsGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(@ConnectedSocket() client: Socket): Promise<void> {
    try {
      const token =
        (client.handshake.auth?.token as string | undefined) ??
        (typeof client.handshake.headers.authorization === 'string'
          ? client.handshake.headers.authorization.replace(/^Bearer\s+/i, '')
          : undefined);
      if (!token) {
        client.disconnect(true);
        return;
      }
      const payload = this.jwt.verify<JwtPayload>(token);
      const role = payload.role;
      (client.data as Record<string, unknown>).user = {
        userId: payload.sub,
        role,
        boutiqueId: payload.boutiqueId,
      };

      if (ROLES_RESEAU_TRESORERIE.includes(role)) {
        await client.join('reseau');
      } else if (role === ROLE_SUPERVISEUR_ZONE && payload.boutiqueId) {
        const boutique = await this.prisma.boutique.findUnique({
          where: { id: payload.boutiqueId },
        });
        if (boutique) await client.join(`zone:${boutique.zoneId}`);
      } else if (
        ROLES_PERIMETRE_BOUTIQUE.includes(role) &&
        payload.boutiqueId
      ) {
        await client.join(`boutique:${payload.boutiqueId}`);
      } else {
        client.disconnect(true);
      }
    } catch (err) {
      this.logger.warn(`WS auth refusée: ${String(err)}`);
      client.disconnect(true);
    }
  }

  emitStatutChange(payload: TransactionStatutPayload): void {
    this.server.to('reseau').emit(TRANSACTION_STATUT_EVENT, payload);
    if (payload.zoneId) {
      this.server
        .to(`zone:${payload.zoneId}`)
        .emit(TRANSACTION_STATUT_EVENT, payload);
    }
    if (payload.boutiqueId) {
      this.server
        .to(`boutique:${payload.boutiqueId}`)
        .emit(TRANSACTION_STATUT_EVENT, payload);
    }
  }

  emitAlerte(payload: AlerteRealtimePayload, zoneId?: string | null): void {
    this.server.to('reseau').emit(ALERTE_NOUVELLE_EVENT, payload);
    const boutiqueId = payload.details?.boutiqueId as string | undefined;
    if (boutiqueId) {
      this.server
        .to(`boutique:${boutiqueId}`)
        .emit(ALERTE_NOUVELLE_EVENT, payload);
    }
    if (zoneId) {
      this.server.to(`zone:${zoneId}`).emit(ALERTE_NOUVELLE_EVENT, payload);
    }
  }
}
