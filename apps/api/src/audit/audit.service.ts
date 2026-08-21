import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ListAuditQueryDto } from './dto/list-audit-query.dto';

export interface AuditEntry {
  utilisateurId: string;
  action: string;
  entite: string;
  entiteId: string;
  details?: string;
}

// Journal d'audit append-only (§6.7 du cahier des charges) : au-delà de
// record(), ce service n'expose volontairement aucune méthode de mise à
// jour ou de suppression. Toute correction doit passer par une nouvelle
// entrée, jamais une édition. findAll() est une lecture seule paginée pour
// le Contrôleur interne / DAF / Responsable SI (§4).
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.journalAudit.create({ data: entry });
  }

  async findAll(query: ListAuditQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const where: Prisma.JournalAuditWhereInput = {
      ...(query.action ? { action: query.action } : {}),
      ...(query.entite ? { entite: query.entite } : {}),
      ...(query.utilisateurId ? { utilisateurId: query.utilisateurId } : {}),
      ...(query.from || query.to
        ? {
            dateHeure: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [data, total] = await Promise.all([
      this.prisma.journalAudit.findMany({
        where,
        orderBy: { dateHeure: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          utilisateur: {
            select: { id: true, nom: true, prenom: true, login: true },
          },
        },
      }),
      this.prisma.journalAudit.count({ where }),
    ]);

    return { data, total, page, limit };
  }
}
