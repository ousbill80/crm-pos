/** Devis B2B — libellés UI (miroirs des règles API documentées). */

export type StatutDevis =
  | 'BROUILLON'
  | 'ENVOYE'
  | 'ACCEPTE'
  | 'REFUSE'
  | 'ANNULE'
  | 'TRANSFORME';

export const STATUT_DEVIS: Record<StatutDevis, string> = {
  BROUILLON: 'Brouillon',
  ENVOYE: 'Envoyé',
  ACCEPTE: 'Accepté',
  REFUSE: 'Refusé',
  ANNULE: 'Annulé',
  TRANSFORME: 'Transformé',
};

export const ACTION_DEVIS: Record<StatutDevis, string> = {
  BROUILLON: 'Revenir brouillon',
  ENVOYE: 'Envoyer',
  ACCEPTE: 'Accepter',
  REFUSE: 'Refuser',
  ANNULE: 'Annuler',
  TRANSFORME: 'Marquer transformé',
};

const TRANSITIONS: Record<StatutDevis, readonly StatutDevis[]> = {
  BROUILLON: ['ENVOYE', 'ANNULE'],
  ENVOYE: ['ACCEPTE', 'REFUSE', 'ANNULE'],
  ACCEPTE: ['TRANSFORME'],
  REFUSE: [],
  ANNULE: [],
  TRANSFORME: [],
};

export function transitionsDevis(from: StatutDevis): readonly StatutDevis[] {
  return TRANSITIONS[from] ?? [];
}

export function badgeDevis(statut: string): string {
  switch (statut) {
    case 'BROUILLON':
      return 'badge badge-neutral';
    case 'ENVOYE':
      return 'badge badge-info';
    case 'ACCEPTE':
      return 'badge badge-ok';
    case 'REFUSE':
      return 'badge badge-critical';
    case 'ANNULE':
      return 'badge badge-neutral';
    case 'TRANSFORME':
      return 'badge badge-warning';
    default:
      return 'badge badge-neutral';
  }
}

export function formatFcfa(value: string | number): string {
  const n = typeof value === 'number' ? value : Number(value);
  return `${n.toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;
}

export function libelleClient(c: { nom: string; prenom: string | null }) {
  return c.prenom ? `${c.prenom} ${c.nom}`.trim() : c.nom;
}

export interface LigneDevisForm {
  key: string;
  designation: string;
  quantite: string;
  prixUnitaire: string;
  remise: string;
}

export function ligneVide(): LigneDevisForm {
  return {
    key: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    designation: '',
    quantite: '1',
    prixUnitaire: '',
    remise: '0',
  };
}

export function montantLigne(l: LigneDevisForm): number {
  const q = Number(l.quantite) || 0;
  const p = Number(l.prixUnitaire) || 0;
  const r = Number(l.remise) || 0;
  return Math.max(0, q * p - r);
}

export function totalLignes(lignes: LigneDevisForm[]): number {
  return lignes.reduce((acc, l) => acc + montantLigne(l), 0);
}

export function lignesPayload(lignes: LigneDevisForm[]) {
  return lignes.map((l) => ({
    designation: l.designation.trim(),
    quantite: Number(l.quantite),
    prixUnitaire: Number(l.prixUnitaire),
    remise: Number(l.remise) || 0,
  }));
}

export function lignesValides(lignes: LigneDevisForm[]): boolean {
  return (
    lignes.length > 0 &&
    lignes.every(
      (l) =>
        l.designation.trim().length > 0 &&
        Number(l.quantite) >= 1 &&
        Number(l.prixUnitaire) >= 0 &&
        Number.isFinite(Number(l.prixUnitaire)),
    )
  );
}
