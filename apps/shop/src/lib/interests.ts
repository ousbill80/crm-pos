const INTEREST_KEY = 'shop_centres_interet';

export type InterestSnapshot = {
  categories: Record<string, number>;
  produits: string[];
  updatedAt: number;
};

function readRaw(): InterestSnapshot {
  try {
    const raw = localStorage.getItem(INTEREST_KEY);
    if (!raw) return { categories: {}, produits: [], updatedAt: 0 };
    return JSON.parse(raw) as InterestSnapshot;
  } catch {
    return { categories: {}, produits: [], updatedAt: 0 };
  }
}

function writeRaw(next: InterestSnapshot) {
  try {
    localStorage.setItem(INTEREST_KEY, JSON.stringify(next));
  } catch {
    /* quota / private mode */
  }
}

/** Enregistre un intérêt local (complète le funnel serveur). */
export function rememberInterest(opts: {
  categorie?: string | null;
  produitId?: string | null;
  weight?: number;
}) {
  if (typeof localStorage === 'undefined') return;
  const w = opts.weight ?? 1;
  const cur = readRaw();
  if (opts.categorie?.trim()) {
    const key = opts.categorie.trim();
    cur.categories[key] = (cur.categories[key] ?? 0) + w;
  }
  if (opts.produitId) {
    cur.produits = [
      opts.produitId,
      ...cur.produits.filter((id) => id !== opts.produitId),
    ].slice(0, 24);
  }
  cur.updatedAt = Date.now();
  writeRaw(cur);
}

export function topInterestCategories(limit = 3): string[] {
  const cur = readRaw();
  return Object.entries(cur.categories)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([libelle]) => libelle);
}

export function interestHintMessage(): string | null {
  const top = topInterestCategories(1)[0];
  return top ? `Parce que vous regardez ${top}` : null;
}
