import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import type { Fidelite, NiveauFidelite } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { AddPointsDto } from '../dto/add-points.dto';
import { lireSeuilsCrm } from '../crm-seuils';
import { pointsFideliteDepuisMontant } from '../crm-thresholds.constants';

// Programme de fidélité par paliers (§6.6). Seuils lus sur Societe.
@Injectable()
export class FideliteService {
  private readonly logger = new Logger(FideliteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  private computeNiveau(
    pointsCumules: number,
    argent: number,
    or: number,
  ): NiveauFidelite {
    if (pointsCumules >= or) return 'OR';
    if (pointsCumules >= argent) return 'ARGENT';
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
    const seuils = await lireSeuilsCrm(this.prisma);

    const fidelite = await this.prisma.$transaction(async (tx) => {
      const existant = await tx.fidelite.findUnique({ where: { clientId } });
      const nouveauTotal = (existant?.pointsCumules ?? 0) + dto.points;
      const niveau = this.computeNiveau(
        nouveauTotal,
        seuils.seuilFideliteArgent,
        seuils.seuilFideliteOr,
      );

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

  /**
   * Crédit auto après encaissement POS (hors transaction vente/stock).
   * Ne propage pas d’erreur : la vente reste valide si la fidélité échoue.
   */
  async crediterDepuisVente(input: {
    clientId: string | null | undefined;
    montantTotal: { toString(): string } | string | number;
    venteId: string;
    utilisateurId: string;
  }): Promise<Fidelite | null> {
    if (!input.clientId) return null;
    const points = pointsFideliteDepuisMontant(input.montantTotal.toString());
    if (points < 1) return null;
    try {
      return await this.addPoints(
        input.clientId,
        {
          points,
          motif: `Vente ${input.venteId.slice(0, 8)} · auto 1pt/1000 FCFA`,
        },
        input.utilisateurId,
      );
    } catch (err) {
      this.logger.error(
        `Crédit fidélité auto échoué pour vente ${input.venteId}`,
        err instanceof Error ? err.stack : String(err),
      );
      return null;
    }
  }
}
