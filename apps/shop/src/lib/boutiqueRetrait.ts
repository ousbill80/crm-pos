const KEY = 'shop_boutique_retrait';

export function readBoutiqueRetraitId(): string {
  if (typeof localStorage === 'undefined') return '';
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeBoutiqueRetraitId(id: string) {
  if (typeof localStorage === 'undefined') return;
  try {
    if (id) localStorage.setItem(KEY, id);
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode */
  }
}
