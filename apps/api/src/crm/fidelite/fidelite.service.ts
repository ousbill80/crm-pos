import { Injectable, NotFoundException } from '@nestjs/common';
import type { Fidelite, NiveauFidelite } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AddPointsDto } from '../dto/add-points.dto';
import {
  SEUIL_FIDELITE_ARGENT,
  SEUIL_FIDELITE_OR,
} from '../crm-thresholds.constants';

// Programme de fidélité par paliers (§6.6). Seuils documentés dans
// crm-thresholds.constants.ts — non spécifiés numériquement par le cahier
// des charges, choix d'interprétation signalé dans le rapport de fin de
// tâche.
@Injectable()
export class FideliteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private computeNiveau(pointsCumules: number): NiveauFidelite {
    if (pointsCumules >= SEUIL_FIDELITE_OR) return 'OR';
    if (pointsCumules >= SEUIL_FIDELITE_ARGENT) return 'ARGENT';
    return 'BRONZE';
  }

  private async ensureClientExists(clientId: string): Promise<void> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
    });
    if (!client) {
      throw new NotFoundException(`Client "${clientId}" introuvable.`);
    }
  }

  async getForClient(clientId: string): Promise<Fidelite> {
    await this.ensureClientExists(clientId);

    // Un client créé par ce module possède toujours une fiche Fidelite
    // (créée en même temps, voir ClientsService.create) ; upsert défensif
    // pour couvrir un client injecté directement en base (ex. seed/fixture
    // de test) sans passer par l'endpoint de création.
    return this.prisma.fidelite.upsert({
      where: { clientId },
      create: { clientId, pointsCumules: 0, niveau: 'BRONZE' },
      update: {},
    });
  }

  async addPoints(
    clientId: string,
    dto: AddPointsDto,
    utilisateurId: string,
  ): Promise<Fidelite> {
    await this.ensureClientExists(clientId);

    const fidelite = await this.prisma.$transaction(async (tx) => {
      const existant = await tx.fidelite.findUnique({ where: { clientId } });
      const nouveauTotal = (existant?.pointsCumules ?? 0) + dto.points;
      const niveau = this.computeNiveau(nouveauTotal);

      return tx.fidelite.upsert({
        where: { clientId },
        create: { clientId, pointsCumules: nouveauTotal, niveau },
        update: { pointsCumules: nouveauTotal, niveau },
      });
    });

    await this.audit.record({
      utilisateurId,
      action: 'FIDELITE_POINTS_CREDITES',
      entite: 'Fidelite',
      entiteId: fidelite.id,
      details: `+${dto.points} point(s) — total ${fidelite.pointsCumules}, palier ${fidelite.niveau}${dto.motif ? ` (${dto.motif})` : ''}`,
    });

    return fidelite;
  }
}
