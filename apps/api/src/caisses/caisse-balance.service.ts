import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatutTransaction, TypeTransaction } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// CaisseBalanceService — cœur du module Caisses (CLAUDE.md « Grand livre
// append-only pour la trésorerie »).
//
// Le solde d'une caisse ne se stocke/modifie JAMAIS directement
// (`Caisse.soldeCourant` est documenté dans schema.prisma comme une simple
// colonne de cache en lecture seule). Ce service recalcule le solde réel à
// la volée à partir du grand livre immuable `TransactionCaisse`, et
// constitue la SEULE source de vérité pour un solde de caisse dans ce
// module — jamais `caisse.soldeCourant` directement.
//
// CONVENTION DE SIGNE :
//
//   solde(caisse) = SUM(montant WHERE type = VENTE   AND statut = VALIDEE)
//                 - SUM(montant WHERE type = SORTIE_FONDS AND statut = VALIDEE)
//
// appliqué de façon LOCALE à CHAQUE caisse :
//   - VENTE  : encaissement (auxiliaire) ou contrepartie miroir (CENTRALE)
//     d'une SORTIE_FONDS boutique validée / régularisée
//     (`transactionSourceId` renseigné) -> augmente le solde.
//   - SORTIE_FONDS : sortie de fonds de la caisse auxiliaire (versement vers
//     la caisse centrale) -> diminue son solde une fois VALIDEE.
//   - LITIGE : non compté tant que non régularisé en VALIDEE.
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

    const [entrees, sorties] = await Promise.all([
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
    ]);

    const totalEntrees = entrees._sum.montant ?? new Prisma.Decimal(0);
    const totalSorties = sorties._sum.montant ?? new Prisma.Decimal(0);

    return totalEntrees.minus(totalSorties);
  }
}
