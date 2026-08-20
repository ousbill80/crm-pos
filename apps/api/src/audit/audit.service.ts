import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface AuditEntry {
  utilisateurId: string;
  action: string;
  entite: string;
  entiteId: string;
  details?: string;
}

// Journal d'audit append-only (§6.7 du cahier des charges) : ce service
// n'expose volontairement aucune méthode de mise à jour ou de suppression.
// Toute correction doit passer par une nouvelle entrée, jamais une édition.
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.prisma.journalAudit.create({ data: entry });
  }
}
