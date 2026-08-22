/** Couleurs d’accent des widgets KPI CRM (cohérence inter-pages). */
export const CRM_KPI = {
  accent: 'var(--accent)',
  vip: '#9333ea',
  regulier: '#2563eb',
  nouveau: '#64748b',
  marketing: '#059669',
  morales: '#0891b2',
  bronze: '#a67c52',
  argent: '#6b7c93',
  or: '#c9a227',
  caIdentifie: '#2563eb',
  caAnonyme: '#64748b',
  campagnes: '#db2777',
  clients: '#0d9488',
  interactions: '#7c3aed',
  appel: '#2563eb',
  sms: '#059669',
  whatsapp: '#16a34a',
  visite: '#9333ea',
  email: '#ea580c',
  campagneCanal: '#db2777',
} as const;

export function pctPart(part: number, total: number): string | undefined {
  if (total <= 0) return undefined;
  return `${Math.round((part / total) * 100)} %`;
}
