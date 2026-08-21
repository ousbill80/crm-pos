import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutTransaction, TypeTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// CaisseBalanceService — grand livre append-only (CLAUDE.md).
//
// solde(caisse) =
//   SUM(crédits VALIDEE) − SUM(débits VALIDEE)
//
// Crédits :
//   - VENTE (encaissement tiroir, ou miroir CENTRALE d'une SORTIE_FONDS)
//   - TRANSFERT_INTERNE avec transactionSourceId (miroir reçu)
//
// Débits :
//   - SORTIE_FONDS (magasin → centrale, une fois VALIDEE)
//   - TRANSFERT_INTERNE sans transactionSourceId (sortie de la caisse source)
//
// LITIGE : non compté tant que non régularisé en VALIDEE.
// ---------------------------------------------------------------------------
@Injectable()
export class CaisseBalanceService {
  constructor(private readonly prisma: PrismaService) {}

  async calculerSolde(caisseId: string): Promise<Prisma.Decimal> {
    const caisse = await this.prisma.caisse.findUnique({
      where: { id: caisseId },
    });
    if (!caisse) {
      throw new NotFoundException(`Caisse ${caisseId} introuvable.`);
    }

    const [ventes, sorties, transfertsSortants, transfertsEntrants] =
      await Promise.all([
        this.prisma.transactionCaisse.aggregate({
          where: {
            caisseId,
            type: TypeTransaction.VENTE,
            statut: StatutTransaction.VALIDEE,
          },
          _sum: { montant: true },
        }),
        this.prisma.transactionCaisse.aggregate({
          where: {
            caisseId,
            type: TypeTransaction.SORTIE_FONDS,
            statut: StatutTransaction.VALIDEE,
          },
          _sum: { montant: true },
        }),
        this.prisma.transactionCaisse.aggregate({
          where: {
            caisseId,
            type: TypeTransaction.TRANSFERT_INTERNE,
            statut: StatutTransaction.VALIDEE,
            transactionSourceId: null,
          },
          _sum: { montant: true },
        }),
        this.prisma.transactionCaisse.aggregate({
          where: {
            caisseId,
            type: TypeTransaction.TRANSFERT_INTERNE,
            statut: StatutTransaction.VALIDEE,
            NOT: { transactionSourceId: null },
          },
          _sum: { montant: true },
        }),
      ]);

    const credits = (ventes._sum.montant ?? new Prisma.Decimal(0)).plus(
      transfertsEntrants._sum.montant ?? new Prisma.Decimal(0),
    );
    const debits = (sorties._sum.montant ?? new Prisma.Decimal(0)).plus(
      transfertsSortants._sum.montant ?? new Prisma.Decimal(0),
    );

    return credits.minus(debits);
  }
}
