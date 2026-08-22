import { apiFetch } from '../api';

export interface InventaireLigneDto {
  id: string;
  produitId: string;
  quantiteTheorique: string | number;
  quantiteComptee: string | number | null;
  dateComptage?: string | null;
  produit?: {
    designation: string;
    reference?: string | null;
    actif?: boolean;
  };
}

export interface InventaireSessionDto {
  id: string;
  statut: string;
  motif?: string | null;
  dateOuverture: string;
  dateValidation?: string | null;
  entrepotId: string;
  entrepot?: {
    id: string;
    code: string;
    nom: string;
    boutiqueId: string;
    boutique?: { nom: string } | null;
  };
  initiateur?: {
    prenom: string;
    nom: string;
    login: string;
  } | null;
  validateur?: {
    prenom: string;
    nom: string;
    login: string;
  } | null;
  lignes: InventaireLigneDto[];
}

export interface InventairePrioriteDto {
  entrepotId: string;
  code: string;
  nom: string;
  boutiqueId: string;
  nomBoutique: string;
  dernierInventaireAt: string | null;
  joursDepuis: number | null;
  aInventorier: boolean;
  frequenceCibleJours: number;
}

export function listInventaires() {
  return apiFetch<InventaireSessionDto[]>('/inventaires');
}

export function getInventaire(id: string) {
  return apiFetch<InventaireSessionDto>(`/inventaires/${id}`);
}

export function listPrioritesInventaire() {
  return apiFetch<InventairePrioriteDto[]>('/inventaires/priorites');
}

export function ouvrirInventaire(entrepotId: string, motif?: string) {
  return apiFetch<InventaireSessionDto>('/inventaires', {
    method: 'POST',
    body: JSON.stringify({ entrepotId, motif }),
  });
}

export function compterLigne(
  sessionId: string,
  produitId: string,
  quantiteComptee: number,
) {
  return apiFetch<InventaireSessionDto>(`/inventaires/${sessionId}/lignes`, {
    method: 'PATCH',
    body: JSON.stringify({ produitId, quantiteComptee }),
  });
}

export function reporterTheorique(sessionId: string) {
  return apiFetch<InventaireSessionDto>(
    `/inventaires/${sessionId}/reporter-theorique`,
    { method: 'POST' },
  );
}

export function validerInventaire(sessionId: string) {
  return apiFetch<InventaireSessionDto>(`/inventaires/${sessionId}/valider`, {
    method: 'POST',
  });
}

export function annulerInventaire(sessionId: string) {
  return apiFetch<InventaireSessionDto>(`/inventaires/${sessionId}/annuler`, {
    method: 'POST',
  });
}
