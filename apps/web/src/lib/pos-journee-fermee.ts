import { StatutSessionCaisse } from '@caisse-crm/shared';
import type { SessionCaisseDto } from './types';

/** Dernière session FERMEE du tiroir — la clôture n’expulse pas du poste. */
export function derniereSessionFermee(
  sessions: SessionCaisseDto[] | undefined,
  caisseId: string | undefined,
): SessionCaisseDto | undefined {
  if (!sessions || !caisseId) return undefined;
  return sessions
    .filter(
      (s) =>
        s.caisseId === caisseId && s.statut === StatutSessionCaisse.FERMEE,
    )
    .sort((a, b) => {
      const da = Date.parse(a.clotureDateHeure ?? a.ouvertureDateHeure);
      const db = Date.parse(b.clotureDateHeure ?? b.ouvertureDateHeure);
      return db - da;
    })[0];
}

/** Espèces du jour à verser à la centrale : fond compté − fond d’ouverture. */
export function montantPointJournee(session: {
  fondInitial: string;
  fondCompteCloture: string | null;
}): number {
  const point =
    Number(session.fondCompteCloture ?? 0) - Number(session.fondInitial);
  if (!Number.isFinite(point) || point <= 0) return 0;
  return Math.round(point);
}

export const ETAPES_CIRCUIT_FONDS = [
  { id: 'initiee', label: 'Transfert initié', qui: 'Boutique' },
  { id: 'transit', label: 'En transit', qui: 'Resp. / convoyeur' },
  { id: 'reception', label: 'Réception DAF', qui: 'DAF / Caissier central' },
  { id: 'validee', label: 'Validée', qui: 'Fonds à la centrale' },
] as const;

export type EtapeCircuitFondsId = (typeof ETAPES_CIRCUIT_FONDS)[number]['id'];

/** Étape courante du versement magasin → trésorerie principale (§6.4). */
export function indexEtapeCircuitFonds(statutSortie: string | null): number {
  if (statutSortie === 'VALIDEE') return 3;
  if (statutSortie === 'RECEPTIONNEE') return 2;
  if (statutSortie === 'EN_TRANSIT') return 1;
  if (statutSortie === 'INITIEE' || statutSortie === 'LITIGE') return 0;
  return -1;
}
