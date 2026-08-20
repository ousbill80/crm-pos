import { Injectable, NotFoundException } from '@nestjs/common';
import type { InteractionCrm } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { CreateInteractionDto } from '../dto/create-interaction.dto';

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
}
