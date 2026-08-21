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
