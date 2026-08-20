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
// CONVENTION DE SIGNE RETENUE (documentée ici car le cahier des charges ne
// détaille pas l'arithmétique exacte — voir rapport de fin de tâche) :
//
//   solde(caisse) = SUM(montant WHERE type = VENTE   AND statut = VALIDEE)
//                 - SUM(montant WHERE type = SORTIE_FONDS AND statut = VALIDEE)
//
// appliqué de façon LOCALE à CHAQUE caisse (le filtre `caisseId` porte sur
// la caisse dont on calcule le solde, quel que soit son type AUXILIAIRE ou
// CENTRALE) :
//   - VENTE  : encaissement à la caisse -> augmente son solde disponible.
//   - SORTIE_FONDS : sortie de fonds de la caisse (versement vers la caisse
//     centrale, remboursement, dépense) -> diminue son solde disponible,
//     mais UNIQUEMENT une fois VALIDEE (rapprochement sans écart, §6.4) :
//     tant que la transaction est INITIEE / EN_TRANSIT / RECEPTIONNEE, les
//     fonds sont « en transit » et ne doivent pas encore être retirés du
//     solde définitif de la caisse source, ni ajoutés à un autre solde.
//   - LITIGE : transaction bloquée jusqu'à régularisation -> non comptée
//     comme mouvement définitif tant qu'elle n'est pas requalifiée en
//     VALIDEE par une écriture compensatoire tracée.
//
// LIMITE EXPLICITEMENT ASSUMÉE (schéma actuel, non contournée) : ce calcul
// est strictement local à la caisse désignée par `TransactionCaisse.caisseId`
// (typiquement la caisse AUXILIAIRE d'une boutique qui encaisse une vente ou
// initie une sortie de fonds/versement). Le schéma ne fournit AUCUN lien
// explicite entre un SORTIE_FONDS validé d'une caisse boutique et une
// caisse CENTRALE créditée en contrepartie (TransactionCaisse.caisseId est
// une FK unique, et ReceptionValidation ne porte pas de caisseId de
// destination). Créditer automatiquement une caisse CENTRALE à partir des
// sorties de fonds validées des caisses boutiques supposerait une règle
// comptable que le cahier des charges ne spécifie pas explicitement ; ce
// service ne l'invente donc pas silencieusement. Le solde d'une caisse
// CENTRALE, avec ce service, reflète uniquement les TransactionCaisse
// directement enregistrées sur son propre id (le cas échéant). Toute
// évolution de ce comportement (ex. ajout d'un lien explicite
// caisse-destination sur TransactionCaisse/ReceptionValidation) est un choix
// de modélisation à valider avec l'utilisateur, pas une décision à prendre
// unilatéralement ici.
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
