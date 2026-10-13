import { apiFetch } from '../api';

/**
 * OrdreDePose — extension pose/installation atelier (hors §6.5 d'origine,
 * validée par l'utilisateur). Le QR imprimé sur le reçu atelier encode
 * "id:qrToken" (cf. OrdresPoseService.genererQrPngBase64) : l'id permet au
 * technicien de consulter l'ordre, le qrToken prouve la possession du reçu
 * papier à la confirmation de démarrage.
 */
export interface LignePoseDto {
  id: string;
  produitId: string;
  quantite: number;
  produit: { designation: string; reference: string | null };
}

export interface OrdreDePoseDetailDto {
  id: string;
  venteId: string;
  boutiqueId: string;
  statut: 'EN_ATTENTE' | 'EN_COURS' | 'TERMINEE' | 'ANNULEE';
  technicienId: string | null;
  dateCreation: string;
  dateDebut: string | null;
  dateFin: string | null;
  lignes: LignePoseDto[];
  technicien: { id: string; nom: string; prenom: string } | null;
  boutique: { id: string; nom: string } | null;
}

/** QR scanné = "<id>:<qrToken>" — rien d'autre n'identifie l'ordre côté papier. */
export function parseQrOrdrePose(
  data: string,
): { id: string; qrToken: string } | null {
  const i = data.indexOf(':');
  if (i <= 0 || i === data.length - 1) return null;
  return { id: data.slice(0, i), qrToken: data.slice(i + 1) };
}

export function getOrdreDePose(id: string) {
  return apiFetch<OrdreDePoseDetailDto>(`/ordres-pose/${id}`);
}

export function demarrerOrdreDePose(id: string, qrToken: string) {
  return apiFetch<OrdreDePoseDetailDto>(`/ordres-pose/${id}/demarrer`, {
    method: 'POST',
    body: JSON.stringify({ qrToken }),
  });
}

export function terminerOrdreDePose(id: string) {
  return apiFetch<OrdreDePoseDetailDto>(`/ordres-pose/${id}/terminer`, {
    method: 'POST',
  });
}

export function annulerOrdreDePose(id: string, motif: string) {
  return apiFetch<OrdreDePoseDetailDto>(`/ordres-pose/${id}/annuler`, {
    method: 'POST',
    body: JSON.stringify({ motif }),
  });
}
