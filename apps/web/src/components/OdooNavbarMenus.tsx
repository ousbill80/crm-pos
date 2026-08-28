import { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { ChevronDown } from 'lucide-react';
import {
  leafMenus,
  locationMatchesMenu,
  menuOrChildActive,
  type AppMenu,
} from '../lib/odoo-menus';

function menuKey(menu: AppMenu): string {
  return `${menu.label}:${menu.to}`;
}

function LeafLink({
  menu,
  siblingTos,
  menuitem = false,
}: {
  menu: AppMenu;
  siblingTos: string[];
  menuitem?: boolean;
}) {
  const location = useLocation();
  const matches = locationMatchesMenu(menu.to, location, siblingTos);

  return (
    <NavLink
      to={menu.to}
      end
      role={menuitem ? 'menuitem' : undefined}
      className={() => (matches ? 'actif' : undefined)}
      aria-current={matches ? 'page' : undefined}
    >
      {menu.label}
    </NavLink>
  );
}

function MenuDropdown({
  menu,
  siblingTos,
  open,
  onToggle,
}: {
  menu: AppMenu;
  siblingTos: string[];
  open: boolean;
  onToggle: () => void;
}) {
  const location = useLocation();
  const active = menuOrChildActive(menu, location, siblingTos);
  const children = menu.children ?? [];

  return (
    <div className="odoo-menu-item">
      <button
        type="button"
        className={active ? 'odoo-menu-trigger actif' : 'odoo-menu-trigger'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={onToggle}
      >
        {menu.label}
        <ChevronDown size={13} strokeWidth={2.25} aria-hidden="true" />
      </button>
      {open && (
        <div className="odoo-menu-dropdown" role="menu">
          {children.map((child) => (
            <LeafLink key={menuKey(child)} menu={child} siblingTos={siblingTos} menuitem />
          ))}
        </div>
      )}
    </div>
  );
}

export function OdooNavbarMenus({
  menus,
  ariaLabel,
}: {
  menus: AppMenu[];
  ariaLabel: string;
}) {
  const location = useLocation();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const navRef = useRef<HTMLElement>(null);
  const siblingTos = useMemo(() => leafMenus(menus).map((menu) => menu.to), [menus]);

  useEffect(() => {
    setOpenKey(null);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!openKey) return;
    function onPointerDown(event: MouseEvent) {
      if (navRef.current && !navRef.current.contains(event.target as Node)) {
        setOpenKey(null);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpenKey(null);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [openKey]);

  return (
    <nav ref={navRef} className="odoo-menus" aria-label={ariaLabel}>
      {menus.map((menu) => {
        const key = menuKey(menu);
        if (menu.children && menu.children.length > 0) {
          return (
            <MenuDropdown
              key={key}
              menu={menu}
              siblingTos={siblingTos}
              open={openKey === key}
              onToggle={() => setOpenKey((current) => (current === key ? null : key))}
            />
          );
        }
        return <LeafLink key={key} menu={menu} siblingTos={siblingTos} />;
      })}
    </nav>
  );
}
