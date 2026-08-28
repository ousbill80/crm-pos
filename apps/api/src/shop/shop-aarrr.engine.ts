/** Funnel AARRR boutique — ranking réel (ventes + stock + centres d’intérêt). */

export const SHOP_FUNNEL_ACTIONS_CLIENT = [
  'VIEW_HOME',
  'VIEW_PDP',
  'SEARCH',
  'LANDING',
  'SHARE',
  'ADD_CART',
] as const;

export const SHOP_FUNNEL_ACTIONS_SERVEUR = [
  'INSCRIPTION',
  'CHECKOUT',
  'PURCHASE',
  'REPEAT_PURCHASE',
  'INSCRIPTION_PARRAINEE',
] as const;

export type ShopFunnelActionClient =
  (typeof SHOP_FUNNEL_ACTIONS_CLIENT)[number];
export type ShopFunnelActionServeur =
  (typeof SHOP_FUNNEL_ACTIONS_SERVEUR)[number];
export type ShopFunnelAction =
  | ShopFunnelActionClient
  | ShopFunnelActionServeur;

export const SHOP_FUNNEL_ETAPES = [
  'ACQUISITION',
  'ACTIVATION',
  'REVENUE',
  'RETENTION',
  'REFERRAL',
] as const;

export type ShopFunnelEtape = (typeof SHOP_FUNNEL_ETAPES)[number];

/** Commandes web qui comptent comme engagement d’achat (pas panier / attente PSP / annulé). */
export const STATUTS_COMMANDE_REVENUE = [
  'PAYEE',
  'PREPARATION',
  'PRETE',
  'EXPEDIEE',
  'LIVREE',
  'REMISE',
] as const;

export type ProduitSignal = {
  produitId: string;
  ventes24h: number;
  ventes7j: number;
  ventes30j: number;
  stockDisponible: number | null;
  vuesSession: number;
  /** Legacy boolean — vrai si la catégorie a été vue au moins une fois. */
  categorieVue: boolean;
  /** Poids d’affinité catégorie (0–10) dérivé du profil d’intérêt. */
  affiniteCategorie: number;
  /** Produit déjà ajouté au panier pendant la session. */
  dansPanierSession: boolean;
  /** Catégorie / libellé aligné sur une recherche récente. */
  matchRecherche: boolean;
};

export type CentreInteret = {
  libelle: string;
  poids: number;
};

export type ProfilInteret = {
  categories: CentreInteret[];
  produitIds: string[];
  recherches: string[];
  personnalise: boolean;
};

export type EvenementInteret = {
  action: string;
  produitId?: string | null;
  requete?: string | null;
};

export function estActionFunnelClient(
  action: string,
): action is ShopFunnelActionClient {
  return (SHOP_FUNNEL_ACTIONS_CLIENT as readonly string[]).includes(action);
}

export function estActionFunnelServeur(
  action: string,
): action is ShopFunnelActionServeur {
  return (SHOP_FUNNEL_ACTIONS_SERVEUR as readonly string[]).includes(action);
}

export function etapeAarrr(action: ShopFunnelAction): ShopFunnelEtape {
  switch (action) {
    case 'VIEW_HOME':
    case 'VIEW_PDP':
    case 'SEARCH':
    case 'LANDING':
      return 'ACQUISITION';
    case 'ADD_CART':
    case 'INSCRIPTION':
    case 'CHECKOUT':
      return 'ACTIVATION';
    case 'PURCHASE':
      return 'REVENUE';
    case 'REPEAT_PURCHASE':
      return 'RETENTION';
    case 'SHARE':
    case 'INSCRIPTION_PARRAINEE':
      return 'REFERRAL';
  }
}

/** Construit un profil d’intérêt à partir des événements session / compte. */
export function construireProfilInteret(
  events: EvenementInteret[],
  produitMeta: Map<string, { categorie: string | null }>,
  categorieDepuisRequete: (requete: string) => string | null,
): ProfilInteret {
  const catPoids = new Map<string, number>();
  const produitIds: string[] = [];
  const recherches: string[] = [];
  const seenProd = new Set<string>();

  const bumpCat = (cat: string | null | undefined, w: number) => {
    if (!cat?.trim()) return;
    const key = cat.trim();
    catPoids.set(key, (catPoids.get(key) ?? 0) + w);
  };

  for (const ev of events) {
    if (ev.action === 'VIEW_PDP' && ev.produitId) {
      if (!seenProd.has(ev.produitId)) {
        seenProd.add(ev.produitId);
        produitIds.push(ev.produitId);
      }
      bumpCat(produitMeta.get(ev.produitId)?.categorie, 2);
    }
    if (ev.action === 'ADD_CART' && ev.produitId) {
      if (!seenProd.has(ev.produitId)) {
        seenProd.add(ev.produitId);
        produitIds.push(ev.produitId);
      }
      bumpCat(produitMeta.get(ev.produitId)?.categorie, 5);
    }
    if (ev.action === 'SEARCH' && ev.requete?.trim()) {
      const q = ev.requete.trim().slice(0, 80);
      recherches.push(q);
      const implied = categorieDepuisRequete(q);
      bumpCat(implied ?? q, implied ? 4 : 1.5);
    }
  }

  const categories = [...catPoids.entries()]
    .map(([libelle, poids]) => ({ libelle, poids }))
    .sort((a, b) => b.poids - a.poids || a.libelle.localeCompare(b.libelle))
    .slice(0, 6);

  return {
    categories,
    produitIds: produitIds.slice(0, 24),
    recherches: [...new Set(recherches)].slice(0, 8),
    personnalise: categories.length > 0 || produitIds.length > 0,
  };
}

export function affiniteCategoriePourProduit(
  categorie: string | null | undefined,
  profil: ProfilInteret,
): number {
  if (!categorie || !profil.categories.length) return 0;
  const fold = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .toLowerCase();
  const target = fold(categorie);
  let best = 0;
  const maxPoids = profil.categories[0]?.poids ?? 1;
  for (const c of profil.categories) {
    const f = fold(c.libelle);
    if (f === target || target.includes(f) || f.includes(target)) {
      const norm = Math.min(10, (c.poids / maxPoids) * 10);
      if (norm > best) best = norm;
    }
  }
  return best;
}

export function scoreDecouverte(s: ProduitSignal): number {
  const velocity = s.ventes24h * 4 + s.ventes7j * 2 + s.ventes30j;
  const scarcity =
    s.stockDisponible != null &&
    s.stockDisponible > 0 &&
    s.stockDisponible <= 3
      ? 1.5
      : 0;
  const personal =
    s.vuesSession * 3 +
    (s.categorieVue ? 2 : 0) +
    s.affiniteCategorie * 4 +
    (s.dansPanierSession ? 5 : 0) +
    (s.matchRecherche ? 3 : 0);
  return velocity + scarcity + personal;
}

/** Ranking « Pour vous » : centres d’intérêt dominent la vélocité réseau. */
export function scorePourVous(s: ProduitSignal): number {
  return (
    scoreDecouverte(s) +
    s.affiniteCategorie * 8 +
    s.vuesSession * 4 +
    (s.matchRecherche ? 6 : 0) -
    (s.dansPanierSession ? 12 : 0)
  );
}

export function badgeDecouverte(s: ProduitSignal): string | undefined {
  if (s.affiniteCategorie >= 6) return 'Pour vous';
  if (s.ventes24h >= 2) return 'Tendance';
  if (
    s.stockDisponible != null &&
    s.stockDisponible > 0 &&
    s.stockDisponible <= 3
  ) {
    return 'Stock limité';
  }
  if (s.ventes30j >= 5) return 'Plus vendu';
  return undefined;
}

export function raisonPersonnalisation(
  s: ProduitSignal,
  profil: ProfilInteret,
): string | undefined {
  if (s.matchRecherche && profil.recherches[0]) {
    return `Lié à « ${profil.recherches[0]} »`;
  }
  if (s.affiniteCategorie >= 4 && profil.categories[0]) {
    return `Parce que vous regardez ${profil.categories[0].libelle}`;
  }
  if (s.vuesSession > 0) return 'Vu récemment';
  if (s.ventes24h >= 2) return 'Populaire en ce moment';
  return undefined;
}

export function rangerFeed<T extends { id: string; signal: ProduitSignal }>(
  items: T[],
  tailles: { flash?: number; pourVous?: number; tendances?: number } = {},
) {
  const flashN = tailles.flash ?? 6;
  const pourVousN = tailles.pourVous ?? 16;
  const tendancesN = tailles.tendances ?? 12;
  const byId = (a: T, b: T) => a.id.localeCompare(b.id);
  const flash = [...items].sort(
    (a, b) =>
      b.signal.ventes24h - a.signal.ventes24h ||
      scoreDecouverte(b.signal) - scoreDecouverte(a.signal) ||
      byId(a, b),
  );
  const pourVous = [...items].sort(
    (a, b) =>
      scorePourVous(b.signal) - scorePourVous(a.signal) || byId(a, b),
  );
  const tendances = [...items].sort(
    (a, b) =>
      b.signal.ventes30j - a.signal.ventes30j ||
      scoreDecouverte(b.signal) - scoreDecouverte(a.signal) ||
      byId(a, b),
  );
  return {
    flash: flash.slice(0, flashN),
    pourVous: pourVous.slice(0, pourVousN),
    tendances: tendances.slice(0, tendancesN),
  };
}

export function tauxPourcent(
  numerateur: number,
  denominateur: number,
): number {
  if (denominateur <= 0) return 0;
  return Math.round((numerateur / denominateur) * 10_000) / 100;
}

export type CompteursAarrr = {
  sessionsAcquisition: number;
  vuesHome: number;
  vuesPdp: number;
  recherches: number;
  landings: number;
  sessionsActivation: number;
  ajoutsPanier: number;
  inscriptions: number;
  checkouts: number;
  commandesPayees: number;
  caTtc: number;
  clientsRecurrents: number;
  clientsAcheteurs: number;
  partages: number;
  inscriptionsParrainees: number;
};

export function syntheseAarrr(c: CompteursAarrr) {
  return {
    acquisition: {
      sessions: c.sessionsAcquisition,
      vuesHome: c.vuesHome,
      vuesPdp: c.vuesPdp,
      recherches: c.recherches,
      landings: c.landings,
    },
    activation: {
      sessions: c.sessionsActivation,
      ajoutsPanier: c.ajoutsPanier,
      inscriptions: c.inscriptions,
      checkouts: c.checkouts,
      tauxActivation: tauxPourcent(
        c.sessionsActivation,
        c.sessionsAcquisition,
      ),
    },
    revenue: {
      commandes: c.commandesPayees,
      caTtc: c.caTtc,
      panierMoyen:
        c.commandesPayees > 0
          ? Math.round(c.caTtc / c.commandesPayees)
          : 0,
      tauxConversion: tauxPourcent(c.commandesPayees, c.sessionsAcquisition),
    },
    retention: {
      clientsAcheteurs: c.clientsAcheteurs,
      clientsRecurrents: c.clientsRecurrents,
      partRecurrente: tauxPourcent(c.clientsRecurrents, c.clientsAcheteurs),
    },
    referral: {
      partages: c.partages,
      inscriptionsParrainees: c.inscriptionsParrainees,
      tauxParrainage: tauxPourcent(
        c.inscriptionsParrainees,
        c.inscriptions,
      ),
    },
  };
}
