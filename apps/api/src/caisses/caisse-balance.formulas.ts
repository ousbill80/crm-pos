import { Prisma, StatutTransaction, TypeTransaction } from '@prisma/client';

/** Pure helpers for ledger sign convention (unit-tested). */
export function soldeDepuisAgregats(parts: {
  ventes: Prisma.Decimal;
  sortiesFonds: Prisma.Decimal;
  transfertsSortants: Prisma.Decimal;
  transfertsEntrants: Prisma.Decimal;
}): Prisma.Decimal {
  const credits = parts.ventes.plus(parts.transfertsEntrants);
  const debits = parts.sortiesFonds.plus(parts.transfertsSortants);
  return credits.minus(debits);
}

export function zero(): Prisma.Decimal {
  return new Prisma.Decimal(0);
}

export const STATUT_COMPTE_SOLDE = StatutTransaction.VALIDEE;
export const TYPES_CREDIT_DIRECT = [TypeTransaction.VENTE] as const;
export const TYPES_DEBIT_DIRECT = [TypeTransaction.SORTIE_FONDS] as const;

/** Sens d'une écriture VALIDEE sur le grand livre d'une caisse. */
export function sensEcriture(tx: {
  type: TypeTransaction;
  transactionSourceId: string | null;
}): 'CREDIT' | 'DEBIT' {
  if (tx.type === TypeTransaction.VENTE) return 'CREDIT';
  if (tx.type === TypeTransaction.SORTIE_FONDS) return 'DEBIT';
  if (tx.type === TypeTransaction.TRANSFERT_INTERNE) {
    // Miroir reçu = crédit ; sortie source = débit.
    return tx.transactionSourceId ? 'CREDIT' : 'DEBIT';
  }
  return 'CREDIT';
}

export function libelleEcriture(tx: {
  type: TypeTransaction;
  transactionSourceId: string | null;
}): string {
  if (tx.type === TypeTransaction.VENTE) return 'Encaissement / vente';
  if (tx.type === TypeTransaction.SORTIE_FONDS) {
    return 'Versement magasin → centrale';
  }
  if (tx.type === TypeTransaction.TRANSFERT_INTERNE) {
    return tx.transactionSourceId
      ? 'Transfert reçu (interne)'
      : 'Transfert sortant (interne)';
  }
  return String(tx.type);
}
