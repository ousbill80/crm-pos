import { Injectable, NotFoundException } from '@nestjs/common';
import type { InteractionCrm, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateInteractionDto } from '../dto/create-interaction.dto';
import { ListInteractionsQueryDto } from '../dto/list-interactions-query.dto';

@Injectable()
export class InteractionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private async ensureClientExists(clientId: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Client "${clientId}" introuvable.`);
    }
  }

  async create(
    clientId: string,
    dto: CreateInteractionDto,
    utilisateurId: string,
  ): Promise<InteractionCrm> {
    await this.ensureClientExists(clientId);

    const interaction = await this.prisma.interactionCrm.create({
      data: {
        clientId,
        type: dto.type,
        canal: dto.canal,
        contenu: dto.contenu,
        date: dto.date ? new Date(dto.date) : undefined,
      },
    });

    await this.audit.record({
      utilisateurId,
      action: 'INTERACTION_CRM_CREEE',
      entite: 'InteractionCrm',
      entiteId: interaction.id,
      details: `Canal ${interaction.canal} — ${interaction.type}`,
    });

    return interaction;
  }

  async findAllForClient(clientId: string): Promise<InteractionCrm[]> {
    await this.ensureClientExists(clientId);

    return this.prisma.interactionCrm.findMany({
      where: { clientId },
      orderBy: { date: 'desc' },
    });
  }

  /** Journal consolidé réseau (§6.6) — lecture seule. */
  async findAllReseau(query: ListInteractionsQueryDto) {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;

    const where: Prisma.InteractionCrmWhereInput = {};
    if (query.clientId) where.clientId = query.clientId;
    if (query.canal) where.canal = query.canal;
    if (query.type) where.type = query.type;
    if (query.dateFrom || query.dateTo) {
      where.date = {};
      if (query.dateFrom) where.date.gte = new Date(query.dateFrom);
      if (query.dateTo) where.date.lte = new Date(query.dateTo);
    }
    if (query.q) {
      const q = query.q.trim();
      where.client = {
        OR: [
          { nom: { contains: q, mode: 'insensitive' } },
          { prenom: { contains: q, mode: 'insensitive' } },
          { contact: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.interactionCrm.count({ where }),
      this.prisma.interactionCrm.findMany({
        where,
        orderBy: { date: 'desc' },
        take: limit,
        skip: offset,
        include: {
          client: {
            select: {
              id: true,
              nom: true,
              prenom: true,
              contact: true,
            },
          },
        },
      }),
    ]);

    return {
      total,
      limit,
      offset,
      items: rows.map((r) => ({
        id: r.id,
        clientId: r.clientId,
        client: r.client,
        type: r.type,
        canal: r.canal,
        contenu: r.contenu,
        date: r.date.toISOString(),
      })),
    };
  }
}
