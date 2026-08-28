import { RoleLibelle } from '@caisse-crm/shared';

export const TZ_BRIEFING = 'Africa/Abidjan';

export const ROLES_BRIEFING_SOIR: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

export const ROLES_BRIEFING_EXECUTIF: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
];

export const ROLES_RELANCE_CONNEXION: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.CAISSIER_CENTRAL,
  RoleLibelle.CONTROLEUR_INTERNE,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.RESPONSABLE_CRM,
];

export const ROLES_ALERTE_SHOP: RoleLibelle[] = [
  RoleLibelle.DIRECTION_GENERALE,
  RoleLibelle.DAF,
  RoleLibelle.RESPONSABLE_SI,
  RoleLibelle.RESPONSABLE_CRM,
];

export type TypeBriefing =
  | 'SOIR'
  | 'HEBDO'
  | 'MOIS'
  | 'RELANCE_CONNEXION'
  | 'SHOP_INACTIF';

export type BoutiqueCa = {
  nom: string;
  ca: number;
  tickets: number;
};

export type SnapshotVentes = {
  periodeLabel: string;
  caReseau: number;
  tickets: number;
  parBoutique: BoutiqueCa[];
  caWeb: number;
  commandesWeb: number;
  litigesOuverts: number;
  versementsEnRetard: number;
};

export type SnapshotStocks = {
  valeurStock: number;
  ruptures: number;
  sousSeuil: number;
};

/** File de versements magasin → centrale, recalculée depuis le grand livre (§6.4). */
export type SnapshotFinance = {
  initiee: { n: number; montant: number };
  enTransit: { n: number; montant: number };
  receptionnee: { n: number; montant: number };
  valideePeriode: { n: number; montant: number };
  litige: { n: number; montant: number };
  versementsEnRetard: number;
};

export type SnapshotShop = {
  shopActif: boolean;
  produitsVisibles: number;
  commandes7j: number;
  sessions7j: number;
};

export function jourCleAbidjan(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ_BRIEFING,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
}

export function debutJourAbidjan(d = new Date()): Date {
  return new Date(`${jourCleAbidjan(d)}T00:00:00.000Z`);
}

export function finJourAbidjan(d = new Date()): Date {
  return new Date(`${jourCleAbidjan(d)}T23:59:59.999Z`);
}

export function estDernierJourDuMois(d = new Date()): boolean {
  const jour = jourCleAbidjan(d);
  const lendemain = new Date(`${jour}T12:00:00.000Z`);
  lendemain.setUTCDate(lendemain.getUTCDate() + 1);
  return jourCleAbidjan(lendemain).slice(0, 7) !== jour.slice(0, 7);
}

export function cleSemaineIso(d = new Date()): string {
  const utc = new Date(`${jourCleAbidjan(d)}T12:00:00.000Z`);
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((utc.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function inactifDepuisHeures(
  derniereConnexion: Date | null,
  maintenant: Date,
  seuilHeures: number,
): boolean {
  if (!derniereConnexion) return true;
  return maintenant.getTime() - derniereConnexion.getTime() >= seuilHeures * 3600_000;
}

export function shopNecessiteAttention(s: SnapshotShop): boolean {
  if (!s.shopActif) return false;
  if (s.produitsVisibles === 0) return true;
  return s.commandes7j === 0;
}

export function classementBoutiques(parBoutique: BoutiqueCa[]): BoutiqueCa[] {
  return [...parBoutique].sort(
    (a, b) => b.ca - a.ca || b.tickets - a.tickets || a.nom.localeCompare(b.nom),
  );
}

export function partCa(boutique: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((boutique / total) * 10_000) / 100;
}

export function pointsAttentionVentes(s: SnapshotVentes): string[] {
  const points: string[] = [];
  if (s.tickets === 0 && s.commandesWeb === 0) {
    points.push('Aucune vente magasin ni commande web sur la période.');
  }
  if (s.litigesOuverts > 0) {
    points.push(
      `${s.litigesOuverts} litige(s) de versement ouverts — à faire arbitrer par le Contrôle interne (§6.4).`,
    );
  }
  if (s.versementsEnRetard > 0) {
    points.push(
      `${s.versementsEnRetard} versement(s) magasin → centrale hors délai.`,
    );
  }
  if (s.caReseau > 0 && s.caWeb === 0 && s.commandesWeb === 0) {
    points.push(
      'Le CA est 100 % magasin : la boutique en ligne n’a pas encore encaissé sur la période.',
    );
  }
  return points;
}

export function astucesShop(s: SnapshotShop, role: RoleLibelle): string[] {
  if (s.produitsVisibles === 0) {
    if (role === RoleLibelle.RESPONSABLE_SI) {
      return [
        'Activer visibleWeb et renseigner prixWeb / photo sur les références vendables.',
        'Vérifier ParametreShop (shop actif, entrepôt web, modes de paiement).',
      ];
    }
    return [
      'Le catalogue en ligne est vide : sans fiches visibles, aucun client ne peut commander.',
      'Demander au SI / catalogue de publier les best-sellers magasin (photo + prix web).',
    ];
  }
  if (role === RoleLibelle.RESPONSABLE_CRM) {
    return [
      'Mettre en avant le click & collect et Wave / Orange Money sur les fiches.',
      'Relancer les clients fidélité vers le site (lien parrainage déjà tracé, sans remise inventée).',
    ];
  }
  if (role === RoleLibelle.DAF) {
    return [
      'Chaque commande web payée entre dans le même grand livre que le POS — pas un circuit parallèle.',
      'Suivre le panier moyen et le taux de conversion (CRM → Croissance boutique).',
    ];
  }
  if (role === RoleLibelle.RESPONSABLE_SI) {
    return [
      'Contrôler slugs, images, stock entrepôt web et webhooks PSP.',
      'Le ranking accueil suit les ventes réelles 24 h / 7 j / 30 j.',
    ];
  }
  return [
    'La boutique en ligne est un 11e magasin : mêmes stocks, mêmes prix paramétrés.',
    'Ouvrir le CRM pour voir le funnel (visites → panier → commandes).',
  ];
}

export function messageRelance(
  role: RoleLibelle,
  heuresSansConnexion: number,
): { objet: string; accroche: string; pourquoi: string } {
  const jours = Math.max(2, Math.round(heuresSansConnexion / 24));
  switch (role) {
    case RoleLibelle.DIRECTION_GENERALE:
      return {
        objet: `Votre réseau a tourné ${jours} j sans votre connexion CRM`,
        accroche:
          'Les boutiques encaissent, les versements avancent, les litiges éventuels restent sans regard Direction.',
        pourquoi:
          'Une connexion quotidienne vous donne le CA par magasin, les écarts et la file web — sans déléguer la validation de caisse (§6.4).',
      };
    case RoleLibelle.DAF:
      return {
        objet: `Pilotage finance : ${jours} j sans connexion`,
        accroche:
          'Soldes de caisses, versements en transit et écarts se recalculent en continu depuis le grand livre.',
        pourquoi:
          'Le cockpit DAF (trésorerie, stocks valorisés, litiges) n’est à jour que si vous l’ouvrez — rien n’est figé dans un tableur.',
      };
    case RoleLibelle.CAISSIER_CENTRAL:
      return {
        objet: `Caisse centrale : ${jours} j sans réception / validation`,
        accroche:
          'Les versements magasin restent en transit tant que vous ne les réceptionnez pas — personne d’autre ne peut solder (§6.4).',
        pourquoi:
          'Seuls Caissier Central et DAF réceptionnent et valident. Une revue de la file (Initiée → Transit → Réceptionnée) débloque le réseau.',
      };
    case RoleLibelle.CONTROLEUR_INTERNE:
      return {
        objet: `Audit : ${jours} j sans passage sur le journal`,
        accroche:
          'Les tentatives d’accès et les litiges de versement s’accumulent en append-only.',
        pourquoi:
          'Votre rôle est lecture + arbitrage des litiges — une revue courte suffit, sans valider une caisse.',
      };
    case RoleLibelle.RESPONSABLE_SI:
      return {
        objet: `SI : ${jours} j sans revue de la boutique / des comptes`,
        accroche:
          'Shop, comptes, audit et paramètres restent sous votre responsabilité opérationnelle.',
        pourquoi:
          'Une connexion permet de voir les commandes web, les alertes d’accès et l’état du catalogue publié.',
      };
    case RoleLibelle.RESPONSABLE_CRM:
      return {
        objet: `CRM : ${jours} j sans animation client`,
        accroche:
          'Fiches réseau, fidélité et funnel boutique n’attendent pas une campagne pour exister.',
        pourquoi:
          'Ouvrez Clients / Croissance boutique pour voir visites, paniers et parrainages réels.',
      };
    default:
      return {
        objet: 'Votre espace CRM vous attend',
        accroche: 'Des faits métier ont été enregistrés pendant votre absence.',
        pourquoi: 'Connectez-vous pour consulter uniquement le périmètre de votre rôle.',
      };
  }
}

export function formatFcfa(n: number): string {
  return `${Math.round(n).toLocaleString('fr-FR')} FCFA`;
}
