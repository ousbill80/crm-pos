import { apiFetch } from '../api';
import type { RetourVenteDto } from '../pos-retours';

export type { RetourVenteDto } from '../pos-retours';

/** Sous-ensemble minimal du produit — miroir de `LigneVenteDto.produit` côté
 * web (`apps/web/src/lib/types.ts`), sans les 60+ champs de `ProduitDto` que
 * cet écran n'utilise pas. */
export interface LigneVenteProduitDto {
  id: string;
  designation: string;
  reference: string | null;
}

export interface LigneVenteDto {
  id: string;
  venteId: string;
  produitId: string;
  produit: LigneVenteProduitDto;
  quantite: number;
  prixUnitaire: string;
  remise: string;
}

export interface PaiementVenteDto {
  id?: string;
  modePaiement: string;
  montant: string;
}

export interface VenteDto {
  id: string;
  dateVente: string;
  montantTotal: string;
  modePaiement: string;
  caisseId: string;
  sessionCaisseId: string;
  clientId: string | null;
  lignes: LigneVenteDto[];
  paiements?: PaiementVenteDto[];
  retours?: RetourVenteDto[];
}

export interface EtatVenteLigneDto {
  id: string;
  dateVente: string;
  montantTotal: string;
  modePaiement: string;
  paiements: { modePaiement: string; montant: string }[];
  nbLignes: number;
}

export interface EtatSessionDto {
  typeEtat: 'X' | 'Z';
  sessionId: string;
  statut: string;
  ouvertureDateHeure: string;
  clotureDateHeure: string | null;
  caisseLibelle: string;
  boutiqueNom: string | null;
  ouvreur: string | null;
  temoinOuverture: string | null;
  clotureur: string | null;
  temoinCloture: string | null;
  societe: {
    raisonSociale: string;
    adresse: string;
    telephone: string | null;
    email: string | null;
  } | null;
  releve: {
    modePaiement: string;
    total: string;
    nombreVentes: number;
  }[];
  ventes: EtatVenteLigneDto[];
  nombreVentes: number;
  fondInitial: string;
  totalEspecesNet: string;
  fondTheorique: string;
  fondCompteCloture: string | null;
  ecart: string | null;
  imprimeAt: string;
}

export interface SessionCaisseListDto {
  id: string;
  caisseId: string;
  statut: string;
  ouvertureDateHeure: string;
  clotureDateHeure: string | null;
  caisse?: { libelle?: string | null; type?: string };
}

export function getEtatSession(sessionId: string) {
  return apiFetch<EtatSessionDto>(`/ventes/sessions/${sessionId}/etat`);
}

/** PDF officiel relevé X/Z — même endpoint que le web. */
export function pathReleveSessionPdf(sessionId: string) {
  return `/ventes/sessions/${sessionId}/cloture/pdf`;
}

export function listSessionsCaisse() {
  return apiFetch<SessionCaisseListDto[]>('/ventes/sessions');
}

/** Upsert idempotent d'un ticket mis en attente (park POS — pas de vente serveur). */
export function upsertReservation(sessionId: string, body: Record<string, unknown>) {
  return apiFetch<unknown>(`/ventes/sessions/${sessionId}/reservations`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

/** Liste des tickets en attente de la session (brut — à normaliser via holdsDepuisApi). */
export function listerTicketsAttente(sessionId: string) {
  return apiFetch<unknown>(`/ventes/sessions/${sessionId}/reservations`);
}

/** Libère un ticket en attente (stock réservé rendu disponible). */
export function libererReservation(sessionId: string, holdId: string) {
  return apiFetch<void>(`/ventes/sessions/${sessionId}/reservations/${holdId}`, {
    method: 'DELETE',
  });
}

/** Détail ligne-à-ligne des ventes de la session (retour/avoir, journal). */
export function listerVentesSession(sessionId: string) {
  return apiFetch<VenteDto[]>(`/ventes/sessions/${sessionId}/ventes`);
}

/** Retour/avoir partiel sur une ligne de vente (§ solde net ESPECES). */
export function creerRetour(
  sessionId: string,
  dto: { ligneVenteId: string; quantite: number },
) {
  return apiFetch<RetourVenteDto>(`/ventes/sessions/${sessionId}/retours`, {
    method: 'POST',
    body: JSON.stringify(dto),
  });
}
