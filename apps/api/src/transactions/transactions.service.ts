import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, TransactionCaisse } from '@prisma/client';
import { StatutTransaction, TypeCaisse } from '@caisse-crm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { AuthenticatedUser } from '../auth/types';
import { TransactionStateMachineService } from './transaction-state-machine.service';
import { CreateTransactionDto } from './dto/create-transaction.dto';
import { RapprocherTransactionDto } from './dto/rapprocher-transaction.dto';

// Orchestre le cycle de vie d'une TransactionCaisse (§6.4). Toute évolution
// de statut passe par TransactionStateMachineService (objet de domaine
// unique — pas de logique de transition dupliquée ici) et génère une
// entrée d'audit horodatée (§6.7). Le solde de caisse (Caisse.soldeCourant)
// n'est jamais écrit par ce module : c'est une colonne de cache recalculée
// par le module Caisses à partir du grand livre append-only.
@Injectable()
export class TransactionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stateMachine: TransactionStateMachineService,
  ) {}

  // INITIEE — Caissier boutique / Responsable boutique (§6.4).
  // Initie à la fois la TransactionCaisse et son bordereau de versement
  // (le montant déclaré sur le bordereau est celui de la transaction).
  async initier(
    dto: CreateTransactionDto,
    utilisateur: AuthenticatedUser,
  ): Promise<TransactionCaisse> {
    const caisse = await this.prisma.caisse.findUnique({
      where: { id: dto.caisseId },
    });

    if (!caisse) {
      throw new NotFoundException('Caisse introuvable.');
    }

    if (caisse.type !== TypeCaisse.AUXILIAIRE) {
      // §6.4 : seule une caisse auxiliaire (boutique) initie un versement /
      // une sortie de fonds à destination de la caisse centrale.
      throw new BadRequestException(
        'Seule une caisse auxiliaire (boutique) peut initier une transaction de versement / sortie de fonds.',
      );
    }

    // Périmètre de données (§6.2) : un utilisateur rattaché à une boutique
    // ne peut initier une transaction que depuis une caisse de sa propre
    // boutique — appliqué côté serveur, jamais seulement côté UI.
    if (
      utilisateur.boutiqueId &&
      caisse.boutiqueId !== utilisateur.boutiqueId
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez initier une transaction que depuis une caisse de votre propre boutique.',
      );
    }

    const transaction = await this.prisma.$transaction(async (tx) => {
      const creee = await tx.transactionCaisse.create({
        data: {
          type: dto.type,
          montant: dto.montant,
          statut: StatutTransaction.INITIEE,
          caisseId: dto.caisseId,
          initiateurId: utilisateur.userId,
        },
      });

      await tx.bordereauVersement.create({
        data: {
          transactionId: creee.id,
          montantDeclare: dto.montant,
          pieceJointe: dto.pieceJointe,
        },
      });

      return creee;
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'TRANSACTION_INITIEE',
      entite: 'TransactionCaisse',
      entiteId: transaction.id,
      details: JSON.stringify({
        type: dto.type,
        montant: dto.montant,
        caisseId: dto.caisseId,
      }),
    });

    return transaction;
  }

  // EN_TRANSIT — Responsable boutique (§6.4). Le cahier des charges
  // mentionne également un "convoyeur", mais aucun rôle correspondant
  // n'existe dans le référentiel RoleLibelle : implémenté avec
  // RESPONSABLE_BOUTIQUE uniquement (voir rapport de fin de tâche).
  async passerEnTransit(
    id: string,
    utilisateur: AuthenticatedUser,
  ): Promise<TransactionCaisse> {
    const transaction = await this.trouverOuEchouer(id);
    this.verifierPerimetreBoutique(transaction, utilisateur);

    this.stateMachine.assertTransitionAutorisee(
      transaction.statut,
      StatutTransaction.EN_TRANSIT,
    );

    const misAJour = await this.prisma.transactionCaisse.update({
      where: { id },
      data: { statut: StatutTransaction.EN_TRANSIT },
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'TRANSACTION_EN_TRANSIT',
      entite: 'TransactionCaisse',
      entiteId: id,
    });

    return misAJour;
  }

  // RECEPTIONNEE — Caissier Central / DAF uniquement (§6.4). Ne fait
  // qu'acter la réception physique ; le rapprochement (comparaison avec le
  // montant déclaré) est une étape distincte (cf. rapprocher()).
  async receptionner(
    id: string,
    utilisateur: AuthenticatedUser,
  ): Promise<TransactionCaisse> {
    const transaction = await this.trouverOuEchouer(id);

    this.stateMachine.assertTransitionAutorisee(
      transaction.statut,
      StatutTransaction.RECEPTIONNEE,
    );

    const misAJour = await this.prisma.transactionCaisse.update({
      where: { id },
      data: { statut: StatutTransaction.RECEPTIONNEE },
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action: 'TRANSACTION_RECEPTIONNEE',
      entite: 'TransactionCaisse',
      entiteId: id,
    });

    return misAJour;
  }

  // VALIDEE ou LITIGE — Caissier Central / DAF uniquement (§6.4), à l'issue
  // du rapprochement entre le montant déclaré (bordereau) et le montant
  // effectivement reçu. Écart nul => VALIDEE ; écart non nul => LITIGE.
  // L'arbitrage d'un LITIGE par le Contrôle interne est mentionné par le
  // cahier des charges sans workflow de résolution concret : non implémenté
  // ici (voir rapport de fin de tâche).
  async rapprocher(
    id: string,
    dto: RapprocherTransactionDto,
    utilisateur: AuthenticatedUser,
  ): Promise<TransactionCaisse> {
    const transaction = await this.prisma.transactionCaisse.findUnique({
      where: { id },
      include: { bordereau: { include: { reception: true } } },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction introuvable.');
    }

    if (!transaction.bordereau) {
      // Ne devrait jamais se produire : le bordereau est créé en même temps
      // que la transaction lors de l'initiation.
      throw new BadRequestException(
        'Aucun bordereau de versement associé à cette transaction.',
      );
    }

    if (transaction.bordereau.reception) {
      throw new BadRequestException(
        'Cette transaction a déjà fait l’objet d’un rapprochement.',
      );
    }

    const montantDeclare = new Prisma.Decimal(
      transaction.bordereau.montantDeclare,
    );
    const montantRecu = new Prisma.Decimal(dto.montantRecu);
    const ecart = montantRecu.minus(montantDeclare);
    const statutFinal = ecart.isZero()
      ? StatutTransaction.VALIDEE
      : StatutTransaction.LITIGE;

    this.stateMachine.assertTransitionAutorisee(
      transaction.statut,
      statutFinal,
    );

    const misAJour = await this.prisma.$transaction(async (tx) => {
      await tx.receptionValidation.create({
        data: {
          bordereauId: transaction.bordereau!.id,
          montantRecu: dto.montantRecu,
          ecart,
          statutFinal,
          validateurId: utilisateur.userId,
        },
      });

      return tx.transactionCaisse.update({
        where: { id },
        data: { statut: statutFinal },
      });
    });

    await this.audit.record({
      utilisateurId: utilisateur.userId,
      action:
        statutFinal === StatutTransaction.VALIDEE
          ? 'TRANSACTION_VALIDEE'
          : 'TRANSACTION_LITIGE',
      entite: 'TransactionCaisse',
      entiteId: id,
      details: JSON.stringify({
        montantDeclare: montantDeclare.toString(),
        montantRecu: montantRecu.toString(),
        ecart: ecart.toString(),
      }),
    });

    return misAJour;
  }

  private async trouverOuEchouer(id: string): Promise<TransactionCaisse> {
    const transaction = await this.prisma.transactionCaisse.findUnique({
      where: { id },
      include: { caisse: true },
    });

    if (!transaction) {
      throw new NotFoundException('Transaction introuvable.');
    }

    return transaction;
  }

  // Périmètre de données (§6.2) : un utilisateur rattaché à une boutique ne
  // peut agir que sur les transactions de sa propre boutique.
  private verifierPerimetreBoutique(
    transaction: TransactionCaisse & { caisse?: { boutiqueId: string | null } },
    utilisateur: AuthenticatedUser,
  ): void {
    if (
      utilisateur.boutiqueId &&
      transaction.caisse?.boutiqueId !== utilisateur.boutiqueId
    ) {
      throw new ForbiddenException(
        'Vous ne pouvez agir que sur une transaction de votre propre boutique.',
      );
    }
  }
}
