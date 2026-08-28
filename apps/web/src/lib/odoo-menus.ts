import type { RoleLibelle } from '@caisse-crm/shared';

export type AppMenu = {
  to: string;
  label: string;
  roles?: RoleLibelle[];
  children?: AppMenu[];
};

const SEARCH_ALIASES: Record<string, Record<string, string>> = {
  rapport: {
    'plan-comptes': 'plan',
    etats: 'bilan',
  },
};

const SEARCH_DEFAULTS: Record<string, string> = {
  rapport: 'balance',
};

/** Params that distinguish sibling screens on the same pathname. */
const MENU_SEARCH_KEYS = ['tab', 'rapport'] as const;

function normalizeSearchValue(key: string, value: string | null): string {
  const aliases = SEARCH_ALIASES[key];
  const raw = value == null || value === '' ? (SEARCH_DEFAULTS[key] ?? '') : value;
  return aliases?.[raw] ?? raw;
}

function pathOf(to: string): string {
  return to.split('?')[0];
}

function pathMatchesLocation(path: string, pathname: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function longestMatchingPath(pathname: string, siblingTos: string[]): string {
  return siblingTos
    .map(pathOf)
    .filter((path) => pathMatchesLocation(path, pathname))
    .reduce((best, path) => (path.length > best.length ? path : best), '');
}

export function leafMenus(menus: AppMenu[]): AppMenu[] {
  return menus.flatMap((menu) =>
    menu.children && menu.children.length > 0 ? leafMenus(menu.children) : [menu],
  );
}

export function filterVisibleMenus(
  menus: AppMenu[],
  isAllowed: (menu: AppMenu) => boolean,
): AppMenu[] {
  return menus.flatMap((menu) => {
    if (menu.children && menu.children.length > 0) {
      const children = filterVisibleMenus(menu.children, isAllowed);
      if (children.length === 0) return [];
      if (children.length === 1) return children;
      return [{ ...menu, children }];
    }
    return isAllowed(menu) ? [menu] : [];
  });
}

export function locationMatchesMenu(
  to: string,
  location: { pathname: string; search: string },
  siblingTos: string[] = [],
): boolean {
  const [path, queryString] = to.split('?');
  if (!pathMatchesLocation(path, location.pathname)) return false;

  if (siblingTos.length > 0) {
    const longest = longestMatchingPath(location.pathname, siblingTos);
    if (longest && path !== longest) return false;
  }

  if (!queryString) {
    const current = new URLSearchParams(location.search);
    return !MENU_SEARCH_KEYS.some((key) => Boolean(current.get(key)));
  }

  const wanted = new URLSearchParams(queryString);
  const current = new URLSearchParams(location.search);
  for (const [key, value] of wanted) {
    if (normalizeSearchValue(key, current.get(key)) !== normalizeSearchValue(key, value)) {
      return false;
    }
  }
  return true;
}

export function menuOrChildActive(
  menu: AppMenu,
  location: { pathname: string; search: string },
  siblingTos: string[] = [],
): boolean {
  if (menu.children && menu.children.length > 0) {
    return menu.children.some((child) => menuOrChildActive(child, location, siblingTos));
  }
  return locationMatchesMenu(menu.to, location, siblingTos);
}
