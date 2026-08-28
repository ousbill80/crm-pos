const SOURCES: Record<string, string> = {
  SUPPLIER_INVOICE: 'Facture fournisseur',
  SUPPLIER_CREDIT: 'Avoir fournisseur',
  SUPPLIER_PAYMENT: 'Paiement fournisseur',
  BANK_MOVEMENT: 'Relevé bancaire',
  STOCK_MOVEMENT: 'Mouvement de stock',
  LANDED_COST: 'Coût logistique',
  CUSTOMS: 'Douane',
  TAX: 'Taxe / retenue',
};

const KINDS: Record<string, string> = {
  DOCUMENT_CLASSIFICATION: 'Classement du document',
  JOURNAL_CODING: 'Journal proposé',
  ACCOUNT_CODING: 'Imputation des comptes',
  TAX_CODING: 'Imputation fiscale',
  ANALYTIC_CODING: 'Imputation analytique',
  MATCHING: 'Rapprochement',
  ANOMALY: 'Anomalie détectée',
};

const STATUSES: Record<string, string> = {
  RAF_REVIEW: 'À revoir',
  AUTO_POST_ELIGIBLE: 'Prêt (politique DAF)',
};

const FINDING_STATUSES: Record<string, string> = {
  OPEN: 'Ouvert',
  ASSIGNED: 'Assigné',
  STORNO_REQUIRED: 'Storno requis',
  RESOLVED: 'Résolu',
  DISMISSED: 'Classé',
};

const SEVERITIES: Record<string, string> = {
  LOW: 'Faible',
  MEDIUM: 'Moyen',
  HIGH: 'Élevé',
  CRITICAL: 'Critique',
};

const RISKS: Record<string, string> = {
  LOW: 'faible',
  MEDIUM: 'moyen',
  HIGH: 'élevé',
};

export const AI_SOURCE_OPTIONS = Object.keys(SOURCES);
export const AI_KIND_OPTIONS = Object.keys(KINDS);

export function labelSource(code: string): string {
  return SOURCES[code] ?? code.replaceAll('_', ' ').toLowerCase();
}

export function labelKind(code: string): string {
  return KINDS[code] ?? code.replaceAll('_', ' ').toLowerCase();
}

export function labelWorkStatus(code: string): string {
  return STATUSES[code] ?? code.replaceAll('_', ' ');
}

export function labelFindingStatus(code: string): string {
  return FINDING_STATUSES[code] ?? code.replaceAll('_', ' ');
}

export function labelSeverity(code: string): string {
  return SEVERITIES[code] ?? code;
}

export function labelRisk(code: string): string {
  return RISKS[code] ?? code.toLowerCase();
}

export function labelProvider(mode: string | undefined, error?: string | null): {
  title: string;
  hint: string;
} {
  if (error) {
    return {
      title: 'Indisponible',
      hint: `Les contrôles métier restent appliqués (${error}).`,
    };
  }
  if (mode === 'EXTERNAL_HTTP') {
    return { title: 'Opérationnel', hint: 'Suggestions du fournisseur + contrôles métier.' };
  }
  if (mode === 'DISABLED') {
    return { title: 'Désactivé', hint: 'Contrôles métier seuls, aucune suggestion externe.' };
  }
  return { title: mode || '—', hint: 'Erreur visible, jamais masquée.' };
}

export function suggestionRows(value: unknown): Array<{ label: string; value: string }> {
  if (value == null) return [];
  if (typeof value !== 'object') return [{ label: 'Valeur', value: String(value) }];
  return Object.entries(value as Record<string, unknown>).map(([key, item]) => ({
    label: key.replaceAll('_', ' '),
    value:
      item == null
        ? '—'
        : typeof item === 'object'
          ? JSON.stringify(item)
          : String(item),
  }));
}
