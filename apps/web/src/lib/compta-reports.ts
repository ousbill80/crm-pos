import { fmtFcfa } from './achats-ui';
import type { AgingRow, BalanceRow, LedgerRow } from './p2p';

export function emptyAgingCopy(kind: 'fournisseurs' | 'clients') {
  if (kind === 'clients') {
    return {
      title: 'Aucun encours 411',
      description:
        'Aucune créance client non lettrée à cette date. Un ticket POS encaissé débite 411 puis est lettré ; le journal de caisse (571) n’apparaît pas ici.',
    };
  }
  return {
    title: 'Aucun encours 401',
    description:
      'Aucune facture d’achat non soldée à cette date. Seules les factures fournisseurs comptabilisées alimentent cette balance âgée.',
  };
}

export function daysOverdue(echeance: string | null, au: string): number {
  if (!echeance) return 0;
  const end = new Date(`${au}T23:59:59.999Z`).getTime();
  const due = new Date(echeance).getTime();
  if (!Number.isFinite(due) || due >= end) return 0;
  return Math.floor((end - due) / 86_400_000);
}

export type AgingBucket = 'current' | 'd30' | 'd60' | 'd90' | 'd90p';

export function agingBucket(echeance: string | null, au: string): AgingBucket {
  const days = daysOverdue(echeance, au);
  if (days <= 0) return 'current';
  if (days <= 30) return 'd30';
  if (days <= 60) return 'd60';
  if (days <= 90) return 'd90';
  return 'd90p';
}

export function agingTotals(rows: AgingRow[], au: string) {
  const empty = { current: 0, d30: 0, d60: 0, d90: 0, d90p: 0, net: 0, paid: 0, due: 0 };
  return rows.reduce((acc, row) => {
    const net = Number(row.netAPayer ?? row.montant);
    const paid = row.allocationsPaiement.reduce((sum, item) => sum + Number(item.montant), 0);
    const due = net - paid;
    acc.net += net;
    acc.paid += paid;
    acc.due += due;
    acc[agingBucket(row.dateEcheance, au)] += due;
    return acc;
  }, empty);
}

export function balanceTotals(rows: BalanceRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.debit += Number(row.debit);
      acc.credit += Number(row.credit);
      acc.solde += Number(row.solde);
      return acc;
    },
    { debit: 0, credit: 0, solde: 0 },
  );
}

export function ledgerTotals(rows: LedgerRow[]) {
  return rows.reduce(
    (acc, row) => {
      acc.debit += Number(row.debit);
      acc.credit += Number(row.credit);
      return acc;
    },
    { debit: 0, credit: 0 },
  );
}

export function groupLedger(rows: LedgerRow[]) {
  const groups = new Map<string, { compte: LedgerRow['compte']; lignes: LedgerRow[] }>();
  for (const row of rows) {
    const current = groups.get(row.compte.id);
    if (current) current.lignes.push(row);
    else groups.set(row.compte.id, { compte: row.compte, lignes: [row] });
  }
  return [...groups.values()];
}

/** Classes du plan SYSCOHADA (référentiel OHADA, pas une règle métier inventée). */
export const CLASSES_SYSCOHADA: Record<string, string> = {
  '1': 'Ressources durables',
  '2': 'Actif immobilisé',
  '3': 'Stocks',
  '4': 'Tiers',
  '5': 'Trésorerie',
  '6': 'Charges',
  '7': 'Produits',
  '8': 'Autres charges et produits',
};

export function classeSyscohada(numero: string): string {
  const digit = numero.replace(/\D/g, '').charAt(0);
  return digit || '—';
}

export function groupBalanceByClasse(rows: BalanceRow[]) {
  const groups = new Map<string, { classe: string; libelle: string; rows: BalanceRow[] }>();
  for (const row of rows) {
    const classe = classeSyscohada(row.numero);
    const current = groups.get(classe);
    if (current) current.rows.push(row);
    else {
      groups.set(classe, {
        classe,
        libelle: CLASSES_SYSCOHADA[classe] ?? 'Autres',
        rows: [row],
      });
    }
  }
  return [...groups.values()].sort((a, b) => a.classe.localeCompare(b.classe));
}

export function moneyClass(value: number): string {
  if (value > 0.005) return 'money solde-debit';
  if (value < -0.005) return 'money solde-credit';
  return 'money';
}

export function fmtSignedFcfa(value: number): string {
  return fmtFcfa(Math.abs(value));
}
