export interface ReceiptLineInput {
  ligneCommandeId: string;
  quantiteRecue: number;
  codeBarres?: string;
  numeroLot?: string;
  dateExpiration?: string;
  numerosSerie?: string[];
  motifEcart?: string;
}

export interface QualityLineInput {
  ligneReceptionId: string;
  quantiteRecue: number;
  quantiteAcceptee: number;
  motifRejet?: string;
}

export function parseSerials(value: string): string[] {
  return [...new Set(value.split(/[\n,;]/).map((v) => v.trim()).filter(Boolean))];
}

export function buildReceiptLine(input: ReceiptLineInput) {
  if (!Number.isInteger(input.quantiteRecue) || input.quantiteRecue <= 0) {
    throw new Error('La quantité reçue doit être un entier strictement positif.');
  }
  const numerosSerie = input.numerosSerie?.filter(Boolean) ?? [];
  if (numerosSerie.length > 0 && numerosSerie.length !== input.quantiteRecue) {
    throw new Error('Le nombre de numéros de série doit égaler la quantité reçue.');
  }
  return {
    ligneCommandeId: input.ligneCommandeId,
    quantiteRecue: input.quantiteRecue,
    ...(input.codeBarres ? { codeBarres: input.codeBarres.trim() } : {}),
    ...(input.numeroLot ? { numeroLot: input.numeroLot.trim() } : {}),
    ...(input.dateExpiration ? { dateExpiration: input.dateExpiration } : {}),
    ...(numerosSerie.length ? { numerosSerie } : {}),
    ...(input.motifEcart ? { motifEcart: input.motifEcart.trim() } : {}),
  };
}

export function buildQualityLine(input: QualityLineInput) {
  const accepted = input.quantiteAcceptee;
  if (!Number.isInteger(accepted) || accepted < 0 || accepted > input.quantiteRecue) {
    throw new Error('La quantité acceptée doit être comprise dans la quantité reçue.');
  }
  const rejected = input.quantiteRecue - accepted;
  if (rejected > 0 && !input.motifRejet?.trim()) {
    throw new Error('Un motif est obligatoire pour toute quantité rejetée.');
  }
  return {
    ligneReceptionId: input.ligneReceptionId,
    quantiteAcceptee: accepted,
    quantiteRejetee: rejected,
    ...(input.motifRejet?.trim() ? { motifRejet: input.motifRejet.trim() } : {}),
  };
}

export function sumAmounts(values: Array<string | number>): number {
  let sum = 0;
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new Error('Montant positif invalide.');
    }
    sum += parsed;
  }
  return sum;
}
