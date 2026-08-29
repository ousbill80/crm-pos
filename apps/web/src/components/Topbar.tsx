import { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  BookOpen,
  ChevronDown,
  Download,
  KeyRound,
  LogOut,
  Radio,
  ShoppingCart,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { rolesPourApp, type RoleLibelle } from '@caisse-crm/shared';
import { apiFetch } from '../lib/api';
import type { AuthUser } from '../context/AuthContext';
import {
  formatAlerteRelative,
  hrefAlerte,
  TYPE_LABEL,
  type AlerteDto,
} from '../lib/alertes-ui';
import {
  couleurAvatarRole,
  initialesLogin,
  libelleProfilUtilisateur,
} from '../lib/user-display';
import { useTresorerieRealtimeStatus } from '../lib/tresorerie-realtime';
import {
  isStandaloneDisplay,
  promptPwaInstall,
  subscribeCanInstall,
} from '../lib/pwa';

function useAlertes() {
  return useQuery({
    queryKey: ['alertes'],
    queryFn: () => apiFetch<AlerteDto[]>('/alertes'),
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

/** Indicateur connexion WebSocket trésorerie (§5.2). */
export function TopbarRealtimeIndicator() {
  const wsStatus = useTresorerieRealtimeStatus();
  if (wsStatus === 'idle') return null;

  const label =
    wsStatus === 'connected'
      ? 'Trésorerie temps réel active'
      : wsStatus === 'connecting'
        ? 'Connexion trésorerie…'
        : 'Trésorerie hors ligne — reconnexion…';

  return (
    <span
      className={
        wsStatus === 'connected'
          ? 'odoo-realtime-indicator connected'
          : wsStatus === 'connecting'
            ? 'odoo-realtime-indicator connecting'
            : 'odoo-realtime-indicator disconnected'
      }
      title={label}
      aria-label={label}
    >
      <Radio size={14} aria-hidden />
    </span>
  );
}

/** Bouton d’installation PWA — visible tant que Chrome n’a pas encore installé. */
export function TopbarPwaInstall() {
  const [canInstall, setCanInstall] = useState(false);
  const standalone = isStandaloneDisplay({
    displayModeStandalone:
      typeof window !== 'undefined' &&
      window.matchMedia('(display-mode: standalone)').matches,
    iosStandalone:
      typeof navigator !== 'undefined' &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
  });

  useEffect(() => subscribeCanInstall(setCanInstall), []);

  if (!canInstall || standalone) return null;

  return (
    <button
      type="button"
      className="odoo-systray-btn"
      title="Installer CaissePOS"
      aria-label="Installer CaissePOS sur cet appareil"
      onClick={() => void promptPwaInstall()}
    >
      <Download size={17} />
    </button>
  );
}

/** Systray : cloche + panneau alertes (aperçu, lien direct). */
export function TopbarSystray() {
  const { data, isLoading } = useAlertes();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const alertes = data ?? [];
  const nombreAlertes = alertes.length;
  const nbCritical = alertes.filter((a) => a.severite === 'CRITICAL').length;
  const apercu = alertes.slice(0, 6);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  function ouvrirAlerte(a: AlerteDto) {
    setOpen(false);
    navigate(hrefAlerte(a));
  }

  return (
    <div className="odoo-systray" ref={ref}>
      <button
        type="button"
        className={
          open
            ? 'odoo-systray-btn actif'
            : nbCritical > 0
              ? 'odoo-systray-btn has-critical'
              : 'odoo-systray-btn'
        }
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`${nombreAlertes} alerte(s) active(s)`}
        title="Alertes"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell size={17} />
        {nombreAlertes > 0 && (
          <span
            className={
              nbCritical > 0 ? 'odoo-systray-badge critical' : 'odoo-systray-badge'
            }
          >
            {nombreAlertes > 99 ? '99+' : nombreAlertes}
          </span>
        )}
      </button>

      {open && (
        <div className="odoo-systray-panel" role="dialog" aria-label="Alertes actives">
          <div className="odoo-systray-panel-head">
            <strong>Alertes</strong>
            {nbCritical > 0 && (
              <span className="odoo-systray-panel-tag critical">
                {nbCritical} critique{nbCritical > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {isLoading && <p className="odoo-systray-empty">Chargement…</p>}

          {!isLoading && apercu.length === 0 && (
            <p className="odoo-systray-empty">Aucune alerte active sur votre périmètre.</p>
          )}

          {!isLoading && apercu.length > 0 && (
            <ul className="odoo-systray-list">
              {apercu.map((a) => (
                <li key={`${a.type}-${a.entiteId}-${a.dateHeure}`}>
                  <button type="button" className="odoo-systray-item" onClick={() => ouvrirAlerte(a)}>
                    <span
                      className={
                        a.severite === 'CRITICAL'
                          ? 'odoo-systray-item-icon critical'
                          : 'odoo-systray-item-icon'
                      }
                      aria-hidden
                    >
                      {a.severite === 'CRITICAL' ? (
                        <AlertCircle size={14} />
                      ) : (
                        <AlertTriangle size={14} />
                      )}
                    </span>
                    <span className="odoo-systray-item-body">
                      <span className="odoo-systray-item-meta">
                        <span className="odoo-systray-item-type">{TYPE_LABEL[a.type] ?? a.type}</span>
                        <time dateTime={a.dateHeure}>{formatAlerteRelative(a.dateHeure)}</time>
                      </span>
                      <span className="odoo-systray-item-msg">{a.message}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className="odoo-systray-panel-foot">
            <Link to="/alertes" className="odoo-systray-link-all" onClick={() => setOpen(false)}>
              {nombreAlertes > 0
                ? `Voir toutes les alertes (${nombreAlertes})`
                : 'Centre des alertes'}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

type TopbarUserMenuProps = {
  user: AuthUser;
  onLogout: () => void;
};

/** Menu utilisateur : avatar, profil, raccourcis. */
export function TopbarUserMenu({ user, onLogout }: TopbarUserMenuProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const role = user.role as RoleLibelle;
  const initiales = initialesLogin(user.login);
  const couleur = couleurAvatarRole(role);
  const profil = libelleProfilUtilisateur(role);
  const peutPos = rolesPourApp('pos').includes(role);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="odoo-user" ref={ref}>
      <button
        type="button"
        className={open ? 'odoo-user-btn actif' : 'odoo-user-btn'}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((v) => !v)}
      >
        <span
          className="odoo-user-avatar"
          style={{ background: couleur }}
          aria-hidden
        >
          {initiales}
        </span>
        <span className="odoo-user-label">{user.login}</span>
        <ChevronDown
          size={14}
          className={open ? 'odoo-user-chevron open' : 'odoo-user-chevron'}
          aria-hidden
        />
      </button>

      {open && (
        <div className="odoo-user-menu" role="menu">
          <div className="odoo-user-menu-header">
            <span
              className="odoo-user-menu-avatar"
              style={{ background: couleur }}
              aria-hidden
            >
              {initiales}
            </span>
            <div className="odoo-user-menu-meta">
              <strong>{user.login}</strong>
              <span>{profil}</span>
            </div>
          </div>

          {peutPos && (
            <button
              type="button"
              role="menuitem"
              className="odoo-user-menu-item"
              onClick={() => {
                setOpen(false);
                navigate('/pos');
              }}
            >
              <ShoppingCart size={16} />
              Point de vente
            </button>
          )}

          <button
            type="button"
            role="menuitem"
            className="odoo-user-menu-item"
            onClick={() => {
              setOpen(false);
              navigate('/manuel-caisse');
            }}
          >
            <BookOpen size={16} />
            Manuel caisse (POS)
          </button>

          <a
            role="menuitem"
            className="odoo-user-menu-item"
            href="/manuel-caisse/Manuel_Utilisation_Caisse_POS.docx"
            download="Manuel_Utilisation_Caisse_POS.docx"
            onClick={() => setOpen(false)}
          >
            <Download size={16} />
            Télécharger le manuel (Word)
          </a>

          <a
            role="menuitem"
            className="odoo-user-menu-item"
            href="/manuel-caisse/Manuel_Utilisation_Caisse_POS_web.zip"
            download="Manuel_Utilisation_Caisse_POS_web.zip"
            onClick={() => setOpen(false)}
          >
            <Download size={16} />
            Télécharger le manuel (Web)
          </a>

          <button
            type="button"
            role="menuitem"
            className="odoo-user-menu-item"
            onClick={() => {
              setOpen(false);
              navigate('/changer-mot-de-passe');
            }}
          >
            <KeyRound size={16} />
            Changer mon mot de passe
          </button>

          <div className="odoo-user-menu-sep" role="separator" />

          <button
            type="button"
            role="menuitem"
            className="odoo-user-menu-item danger"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            <LogOut size={16} />
            Déconnexion
          </button>
        </div>
      )}
    </div>
  );
}
