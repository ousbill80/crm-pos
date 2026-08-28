import { Injectable } from '@nestjs/common';
import type { Societe } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import { UpdateEntrepriseDto } from './dto/update-entreprise.dto';

@Injectable()
export class EntrepriseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async getOrCreate(): Promise<Societe> {
    const existing = await this.prisma.societe.findFirst();
    if (existing) return existing;
    return this.prisma.societe.create({
      data: {
        raisonSociale: 'MAJOR AUTO PARTS',
        adresse: 'Siège',
        devise: 'XOF',
      },
    });
  }

  async update(
    dto: UpdateEntrepriseDto,
    user: AuthenticatedUser,
  ): Promise<Societe> {
    const current = await this.getOrCreate();
    const updated = await this.prisma.societe.update({
      where: { id: current.id },
      data: dto,
    });
    const { logoUrl, ...rest } = dto;
    await this.audit.record({
      utilisateurId: user.userId,
      action: 'ENTREPRISE_UPDATED',
      entite: 'Societe',
      entiteId: updated.id,
      details: JSON.stringify({
        ...rest,
        logoUrl: logoUrl
          ? logoUrl.startsWith('data:')
            ? '[image]'
            : logoUrl
          : logoUrl,
      }),
    });
    return updated;
  }
}
