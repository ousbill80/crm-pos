import {
  classeCompte,
  netSolde,
  type TrialBalanceRow,
} from './syscohada-statements';

export const LIASSE_MENTION_NON_DEPOT =
  'États SYSCOHADA — support de clôture, pas une liasse de dépôt légal.';

export const LIASSE_MENTION_UNE_SOCIETE = 'pas de combiné de groupe';

export const LIASSE_MENTION_AGREGAT =
  'Agrégat non consolidé — éliminations intra-groupe non tenues';

export type LiasseNature = 'actif' | 'passif' | 'charge' | 'produit';

/** Mapping figé préfixe → poste SYSCOHADA (plus long préfixe gagne). */
export type LiassePosteDef = {
  code: string;
  libelle: string;
  prefixes: string[];
  excludePrefixes?: string[];
  nature: LiasseNature;
  /** N’inclure que si le solde (D−C) est strictement du bon signe. */
  debitOnly?: boolean;
  creditOnly?: boolean;
};

export const POSTES_ACTIF: LiassePosteDef[] = [
  {
    code: 'AE',
    libelle: 'Amortissements (28)',
    prefixes: ['28'],
    nature: 'actif',
    creditOnly: true,
  },
  {
    code: 'AD',
    libelle: 'Immobilisations corporelles brutes',
    prefixes: ['2'],
    excludePrefixes: ['28'],
    nature: 'actif',
  },
  {
    code: 'AG',
    libelle: 'Stocks',
    prefixes: ['3'],
    nature: 'actif',
  },
  {
    code: 'AH',
    libelle: 'Créances clients et assimilées',
    prefixes: ['41', '409', '4452'],
    nature: 'actif',
    debitOnly: true,
  },
  {
    code: 'AI',
    libelle: 'Trésorerie',
    prefixes: ['5'],
    nature: 'actif',
  },
  {
    code: 'AJ',
    libelle: 'Autres créances (classe 4 débitrice)',
    prefixes: ['4'],
    excludePrefixes: ['41', '409', '4452'],
    nature: 'actif',
    debitOnly: true,
  },
];

export const POSTES_PASSIF: LiassePosteDef[] = [
  {
    code: 'PA',
    libelle: 'Capital',
    prefixes: ['10'],
    nature: 'passif',
  },
  {
    code: 'PB',
    libelle: 'Réserves',
    prefixes: ['11'],
    nature: 'passif',
  },
  {
    code: 'PC',
    libelle: 'Report à nouveau',
    prefixes: ['12'],
    nature: 'passif',
  },
  {
    code: 'PD',
    libelle: 'Résultat net (compte 13)',
    prefixes: ['13'],
    nature: 'passif',
  },
  {
    code: 'PE',
    libelle: 'Dettes fournisseurs',
    prefixes: ['401', '408'],
    nature: 'passif',
    creditOnly: true,
  },
  {
    code: 'PF',
    libelle: 'Dettes de personnel',
    prefixes: ['421'],
    nature: 'passif',
    creditOnly: true,
  },
  {
    code: 'PG',
    libelle: 'Dettes fiscales (TVA collectée et assimilées)',
    prefixes: ['4457', '447'],
    nature: 'passif',
    creditOnly: true,
  },
  {
    code: 'PH',
    libelle: 'Autres dettes (classe 1 / 4 créditrices)',
    prefixes: ['1', '4'],
    excludePrefixes: [
      '10',
      '11',
      '12',
      '13',
      '401',
      '408',
      '421',
      '4457',
      '447',
    ],
    nature: 'passif',
    creditOnly: true,
  },
];

export const POSTES_CR: LiassePosteDef[] = [
  {
    code: 'TA',
    libelle: 'Ventes',
    prefixes: ['70'],
    nature: 'produit',
  },
  {
    code: 'RB',
    libelle: 'Variation de stocks / CMV (603)',
    prefixes: ['603'],
    nature: 'charge',
  },
  {
    code: 'RA',
    libelle: 'Achats',
    prefixes: ['60'],
    excludePrefixes: ['603'],
    nature: 'charge',
  },
  {
    code: 'RC',
    libelle: 'Services extérieurs',
    prefixes: ['61', '62'],
    nature: 'charge',
  },
  {
    code: 'RD',
    libelle: 'Autres charges (65 / 67 / 68)',
    prefixes: ['65', '67', '68'],
    nature: 'charge',
  },
  {
    code: 'RX',
    libelle: 'Autres charges d’exploitation',
    prefixes: ['6'],
    excludePrefixes: ['60', '61', '62', '65', '67', '68'],
    nature: 'charge',
  },
  {
    code: 'TB',
    libelle: 'Autres produits (75 / 77)',
    prefixes: ['75', '77'],
    nature: 'produit',
  },
  {
    code: 'TX',
    libelle: 'Autres produits',
    prefixes: ['7'],
    excludePrefixes: ['70', '75', '77'],
    nature: 'produit',
  },
];

export type LiasseLigne = {
  code: string;
  libelle: string;
  montant: string;
  calcule?: boolean;
};

export type LiassePerimetre = {
  mode: 'UNE_SOCIETE' | 'SOCIETE_DANS_MULTI' | 'AGREGAT_NON_CONSOLIDE';
  societeCount: number;
  societeLibelle: string | null;
  message: string;
};

export type LiasseNotes = {
  methodes: string[];
  immobilisations: {
    brute: string;
    amortissements: string;
    nette: string;
    source: 'registre' | 'grand_livre';
  };
  encours: { fournisseurs401: string; clients411: string };
  tva: { deductible: string; collectee: string; netAPayer: string };
};

export type LiassePack = {
  mention: string;
  perimetre: LiassePerimetre;
  bilan: {
    actif: LiasseLigne[];
    passif: LiasseLigne[];
    totalActif: string;
    totalPassif: string;
    equilibre: boolean;
  };
  compteResultat: {
    postes: LiasseLigne[];
    ventes: string;
    achatsCmv: string;
    margeCommerciale: string;
    valeurAjoutee: string;
    ebe: string;
    resultat: string;
    benefice: boolean;
  };
  tft: {
    mode: 'INDIRECT_N_N1' | 'N_SEULEMENT';
    mention: string | null;
    lignes: LiasseLigne[];
  };
  notes: LiasseNotes;
};

function money(value: number) {
  return value.toFixed(2);
}

function digits(numero: string) {
  return numero.replace(/\D/g, '');
}

function matchesPoste(numero: string, def: LiassePosteDef): number {
  const n = digits(numero);
  if (!n) return 0;
  if (def.excludePrefixes?.some((prefix) => n.startsWith(prefix))) return 0;
  let best = 0;
  for (const prefix of def.prefixes) {
    if (n.startsWith(prefix) && prefix.length > best) best = prefix.length;
  }
  return best;
}

export function posteForAccount(
  numero: string,
  defs: LiassePosteDef[],
): LiassePosteDef | undefined {
  let best: { def: LiassePosteDef; len: number } | undefined;
  for (const def of defs) {
    const len = matchesPoste(numero, def);
    if (len > 0 && (!best || len > best.len)) best = { def, len };
  }
  return best?.def;
}

function signedAmount(row: TrialBalanceRow, nature: LiasseNature): number {
  const solde = netSolde(row);
  if (nature === 'actif' || nature === 'charge') return solde;
  return -solde;
}

function eligible(row: TrialBalanceRow, def: LiassePosteDef): boolean {
  const solde = netSolde(row);
  if (def.debitOnly && solde <= 0) return false;
  if (def.creditOnly && solde >= 0) return false;
  return true;
}

function sumPostes(
  rows: TrialBalanceRow[],
  defs: LiassePosteDef[],
): Map<string, number> {
  const totals = new Map<string, number>(defs.map((def) => [def.code, 0]));
  for (const row of rows) {
    const debit = Number(row.debit);
    const credit = Number(row.credit);
    if (debit === 0 && credit === 0) continue;
    const def = posteForAccount(row.numero, defs);
    if (!def || !eligible(row, def)) continue;
    totals.set(
      def.code,
      (totals.get(def.code) ?? 0) + signedAmount(row, def.nature),
    );
  }
  return totals;
}

function ligne(
  code: string,
  libelle: string,
  montant: number,
  calcule = false,
): LiasseLigne {
  return { code, libelle, montant: money(montant), calcule };
}

function hasMovement(rows: TrialBalanceRow[]): boolean {
  return rows.some(
    (row) => Number(row.debit) !== 0 || Number(row.credit) !== 0,
  );
}

function sumPrefixes(
  rows: TrialBalanceRow[],
  prefixes: string[],
  sign: 'debit' | 'credit',
): number {
  let total = 0;
  for (const row of rows) {
    const n = digits(row.numero);
    if (!prefixes.some((prefix) => n.startsWith(prefix))) continue;
    const solde = netSolde(row);
    total += sign === 'debit' ? Math.max(solde, 0) : Math.max(-solde, 0);
  }
  return total;
}

export function previousWindow(du: Date, au: Date): { du: Date; au: Date } {
  const duration = au.getTime() - du.getTime();
  const prevAu = new Date(du.getTime() - 1);
  return { du: new Date(prevAu.getTime() - duration), au: prevAu };
}

export function mergeTrialBalances(
  packs: TrialBalanceRow[][],
): TrialBalanceRow[] {
  const map = new Map<
    string,
    { intitule: string; debit: number; credit: number }
  >();
  for (const rows of packs) {
    for (const row of rows) {
      const current = map.get(row.numero) ?? {
        intitule: row.intitule,
        debit: 0,
        credit: 0,
      };
      current.debit += Number(row.debit);
      current.credit += Number(row.credit);
      map.set(row.numero, current);
    }
  }
  return [...map.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([numero, value]) => ({
      numero,
      intitule: value.intitule,
      debit: money(value.debit),
      credit: money(value.credit),
      solde: money(value.debit - value.credit),
    }));
}

export function buildPerimetre(input: {
  societeCount: number;
  societeLibelle?: string | null;
  agregat?: boolean;
}): LiassePerimetre {
  if (input.agregat) {
    if (input.societeCount <= 1) {
      return {
        mode: 'UNE_SOCIETE',
        societeCount: input.societeCount,
        societeLibelle: input.societeLibelle ?? null,
        message: input.societeLibelle
          ? `Société ${input.societeLibelle} — ${LIASSE_MENTION_UNE_SOCIETE}`
          : `Une seule société — ${LIASSE_MENTION_UNE_SOCIETE}`,
      };
    }
    return {
      mode: 'AGREGAT_NON_CONSOLIDE',
      societeCount: input.societeCount,
      societeLibelle: null,
      message: LIASSE_MENTION_AGREGAT,
    };
  }
  if (input.societeCount <= 1) {
    return {
      mode: 'UNE_SOCIETE',
      societeCount: input.societeCount,
      societeLibelle: input.societeLibelle ?? null,
      message: input.societeLibelle
        ? `Société ${input.societeLibelle} — ${LIASSE_MENTION_UNE_SOCIETE}`
        : `Une seule société — ${LIASSE_MENTION_UNE_SOCIETE}`,
    };
  }
  return {
    mode: 'SOCIETE_DANS_MULTI',
    societeCount: input.societeCount,
    societeLibelle: input.societeLibelle ?? null,
    message: input.societeLibelle
      ? `États de la société ${input.societeLibelle} uniquement. ${LIASSE_MENTION_AGREGAT}.`
      : LIASSE_MENTION_AGREGAT,
  };
}

export function buildSyscohadaLiasse(input: {
  rowsN: TrialBalanceRow[];
  rowsN1?: TrialBalanceRow[] | null;
  perimetre: LiassePerimetre;
  notes: LiasseNotes;
}): LiassePack {
  const actifSums = sumPostes(input.rowsN, POSTES_ACTIF);
  const passifSums = sumPostes(input.rowsN, POSTES_PASSIF);
  const crSums = sumPostes(input.rowsN, POSTES_CR);

  const ad = actifSums.get('AD') ?? 0;
  const ae = Math.abs(actifSums.get('AE') ?? 0);
  const af = ad - ae;
  const ag = actifSums.get('AG') ?? 0;
  const ah = actifSums.get('AH') ?? 0;
  const ai = actifSums.get('AI') ?? 0;
  const aj = actifSums.get('AJ') ?? 0;

  const charges = sumClasses(input.rowsN, '6');
  const produits = sumClasses(input.rowsN, '7');
  const resultat = -(produits + charges);

  const actif: LiasseLigne[] = [
    ligne('AD', 'Immobilisations corporelles brutes', ad),
    ligne('AE', 'Amortissements (28)', -ae),
    ligne('AF', 'Immobilisations nettes', af, true),
    ligne('AG', 'Stocks', ag),
    ligne('AH', 'Créances clients et assimilées', ah),
    ligne('AI', 'Trésorerie', ai),
    ligne('AJ', 'Autres créances', aj),
  ];
  let totalActif = af + ag + ah + ai + aj;
  if (resultat < 0) {
    actif.push(ligne('RN', 'Résultat de la période (perte)', -resultat, true));
    totalActif += -resultat;
  }

  const pa = passifSums.get('PA') ?? 0;
  const pb = passifSums.get('PB') ?? 0;
  const pc = passifSums.get('PC') ?? 0;
  const pd = passifSums.get('PD') ?? 0;
  const pe = passifSums.get('PE') ?? 0;
  const pf = passifSums.get('PF') ?? 0;
  const pg = passifSums.get('PG') ?? 0;
  const ph = passifSums.get('PH') ?? 0;
  const passif: LiasseLigne[] = [
    ligne('PA', 'Capital', pa),
    ligne('PB', 'Réserves', pb),
    ligne('PC', 'Report à nouveau', pc),
    ligne('PD', 'Résultat net (13)', pd),
    ligne('PE', 'Dettes fournisseurs', pe),
    ligne('PF', 'Dettes de personnel', pf),
    ligne('PG', 'Dettes fiscales', pg),
    ligne('PH', 'Autres dettes', ph),
  ];
  let totalPassif = pa + pb + pc + pd + pe + pf + pg + ph;
  if (resultat >= 0) {
    passif.push(ligne('RN', 'Résultat de la période', resultat, true));
    totalPassif += resultat;
  }

  const ventes = crSums.get('TA') ?? 0;
  const achats = crSums.get('RA') ?? 0;
  const cmv = crSums.get('RB') ?? 0;
  const services = crSums.get('RC') ?? 0;
  const autresCharges = crSums.get('RD') ?? 0;
  const autresChargesX = crSums.get('RX') ?? 0;
  const autresProduits = (crSums.get('TB') ?? 0) + (crSums.get('TX') ?? 0);
  const achatsCmv = achats + cmv;
  const marge = ventes - achatsCmv;
  const va = marge - services;
  const dotations = sumPrefixes(input.rowsN, ['68'], 'debit');
  const charges65_67 = autresCharges - dotations;
  const ebeApprox = va - Math.max(charges65_67, 0) - autresChargesX;

  const crPostes: LiasseLigne[] = [
    ligne('TA', 'Ventes (70)', ventes),
    ligne('RA', 'Achats (60 hors 603)', achats),
    ligne('RB', 'CMV / variation de stocks (603)', cmv),
    ligne('MB', 'Marge commerciale', marge, true),
    ligne('RC', 'Services extérieurs (61 / 62)', services),
    ligne('VA', 'Valeur ajoutée (approximée)', va, true),
    ligne('RD', 'Autres charges (65 / 67 / 68)', autresCharges),
    ligne('EBE', 'EBE (approximé, avant 68)', ebeApprox, true),
    ligne('TB', 'Autres produits (75 / 77)', autresProduits),
    ligne('RN', 'Résultat de la période', resultat, true),
  ];

  const n1 = input.rowsN1 ?? [];
  const nMoinsUnAbsent = !hasMovement(n1);
  const tft = nMoinsUnAbsent
    ? buildTftNOnly(input.rowsN, resultat)
    : buildTftIndirect(input.rowsN, n1, resultat);

  return {
    mention: LIASSE_MENTION_NON_DEPOT,
    perimetre: input.perimetre,
    bilan: {
      actif,
      passif,
      totalActif: money(totalActif),
      totalPassif: money(totalPassif),
      equilibre: Math.abs(totalActif - totalPassif) < 0.015,
    },
    compteResultat: {
      postes: crPostes,
      ventes: money(ventes),
      achatsCmv: money(achatsCmv),
      margeCommerciale: money(marge),
      valeurAjoutee: money(va),
      ebe: money(ebeApprox),
      resultat: money(resultat),
      benefice: resultat >= 0,
    },
    tft,
    notes: input.notes,
  };
}

function sumClasses(rows: TrialBalanceRow[], classe: string): number {
  let total = 0;
  for (const row of rows) {
    if (classeCompte(row.numero) !== classe) continue;
    const debit = Number(row.debit);
    const credit = Number(row.credit);
    if (debit === 0 && credit === 0) continue;
    total += netSolde(row);
  }
  return total;
}

function bfr(rows: TrialBalanceRow[]): number {
  const stocks =
    sumPrefixes(rows, ['3'], 'debit') - sumPrefixes(rows, ['3'], 'credit');
  const creances =
    sumPrefixes(rows, ['41', '409', '4452'], 'debit') -
    sumPrefixes(rows, ['41', '409', '4452'], 'credit');
  const dettes =
    sumPrefixes(rows, ['401', '408', '421', '4457'], 'credit') -
    sumPrefixes(rows, ['401', '408', '421', '4457'], 'debit');
  return stocks + creances - dettes;
}

function tresorerie(rows: TrialBalanceRow[]): number {
  return sumPrefixes(rows, ['5'], 'debit') - sumPrefixes(rows, ['5'], 'credit');
}

function buildTftNOnly(
  rows: TrialBalanceRow[],
  resultat: number,
): LiassePack['tft'] {
  return {
    mode: 'N_SEULEMENT',
    mention:
      'Exercice N−1 absent : TFT présenté sur N seulement, sans variation.',
    lignes: [
      ligne('R', 'Résultat de la période', resultat),
      ligne('BFR', 'BFR (classes 3–4, stock N)', bfr(rows)),
      ligne('T5', 'Trésorerie (classe 5, stock N)', tresorerie(rows)),
    ],
  };
}

function buildTftIndirect(
  rowsN: TrialBalanceRow[],
  rowsN1: TrialBalanceRow[],
  resultat: number,
): LiassePack['tft'] {
  const deltaBfr = bfr(rowsN) - bfr(rowsN1);
  const deltaTreso = tresorerie(rowsN) - tresorerie(rowsN1);
  return {
    mode: 'INDIRECT_N_N1',
    mention: null,
    lignes: [
      ligne('R', 'Résultat de la période', resultat),
      ligne('BFR', 'Variation du BFR (classes 3–4)', deltaBfr),
      ligne('T5', 'Variation de trésorerie (classe 5)', deltaTreso),
    ],
  };
}

export function liasseToCsv(pack: LiassePack): string {
  const lines = [
    'Section;Code;Libelle;Montant',
    ...pack.bilan.actif.map(
      (row) => `Bilan actif;${row.code};${csv(row.libelle)};${row.montant}`,
    ),
    `Bilan actif;AZ;Total actif;${pack.bilan.totalActif}`,
    ...pack.bilan.passif.map(
      (row) => `Bilan passif;${row.code};${csv(row.libelle)};${row.montant}`,
    ),
    `Bilan passif;PZ;Total passif;${pack.bilan.totalPassif}`,
    ...pack.compteResultat.postes.map(
      (row) =>
        `Compte de resultat;${row.code};${csv(row.libelle)};${row.montant}`,
    ),
    ...pack.tft.lignes.map(
      (row) => `TFT;${row.code};${csv(row.libelle)};${row.montant}`,
    ),
    `Notes;M;${csv(pack.mention)};`,
    `Notes;P;${csv(pack.perimetre.message)};`,
  ];
  return `\uFEFF${lines.join('\n')}\n`;
}

function csv(value: string) {
  if (/[;"\n]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}
