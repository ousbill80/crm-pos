import { Prisma } from '@prisma/client';

export function monthlyDepreciation(input: {
  valeurBrute: Prisma.Decimal | number | string;
  valeurResiduelle?: Prisma.Decimal | number | string;
  dureeMois: number;
  cumulDejaDote?: Prisma.Decimal | number | string;
  nombreDotationsDeja?: number;
}): Prisma.Decimal | null {
  const brute = new Prisma.Decimal(input.valeurBrute);
  const residuelle = new Prisma.Decimal(input.valeurResiduelle ?? 0);
  const amortissable = brute.minus(residuelle);
  if (amortissable.lte(0) || input.dureeMois < 1) return null;
  const deja = input.nombreDotationsDeja ?? 0;
  const remainingMonths = input.dureeMois - deja;
  if (remainingMonths <= 0) return null;
  const cumul = new Prisma.Decimal(input.cumulDejaDote ?? 0);
  const remaining = amortissable.minus(cumul);
  if (remaining.lte(0)) return null;
  if (remainingMonths === 1) return remaining.toDecimalPlaces(2);
  const monthly = amortissable.div(input.dureeMois).toDecimalPlaces(2);
  return Prisma.Decimal.min(monthly, remaining);
}
