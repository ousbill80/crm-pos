import { useEffect, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const DISMISS_KEY = 'shop_pwa_install_dismissed';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    ('standalone' in navigator &&
      Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

/** Téléphone / tablette tactile — pas le bureau. */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  if (/Mobi|Android.+Mobile|iPhone|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    return true;
  }
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) {
    return true;
  }
  const hints = navigator as Navigator & { userAgentData?: { mobile?: boolean } };
  if (hints.userAgentData?.mobile) return true;
  return window.matchMedia('(max-width: 820px) and (pointer: coarse)').matches;
}

function isIosSafari(): boolean {
  const ua = navigator.userAgent;
  const ios =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const safari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome|Chromium|Edg/.test(ua);
  return ios && safari;
}

/**
 * Invite PWA sur mobile : installer l’app, plus mise à jour du service worker.
 */
export function PwaInstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [iosHint, setIosHint] = useState(false);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(swUrl, registration) {
      if (!registration) return;
      window.setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
      void swUrl;
    },
  });

  useEffect(() => {
    if (isStandalone()) return;
    if (!isMobileDevice()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const ios = isIosSafari();

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setIosHint(false);
      setShowInstall(true);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    const onInstalled = () => {
      setShowInstall(false);
      setDeferred(null);
    };
    window.addEventListener('appinstalled', onInstalled);

    const timer = window.setTimeout(() => {
      setIosHint(ios);
      setShowInstall(true);
    }, 1400);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('beforeinstallprompt', onBeforeInstall);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  function dismissInstall() {
    localStorage.setItem(DISMISS_KEY, '1');
    setShowInstall(false);
    setIosHint(false);
    setDeferred(null);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === 'accepted') {
      setShowInstall(false);
    }
    setDeferred(null);
  }

  const hint = iosHint
    ? 'Sur iPhone : bouton Partager, puis « Sur l’écran d’accueil ».'
    : deferred
      ? 'Ajoutez MAJOR à l’écran d’accueil pour un accès plus rapide.'
      : 'Menu du navigateur → Installer l’application / Ajouter à l’écran d’accueil.';

  return (
    <>
      {needRefresh && (
        <div className="pwa-banner" role="status">
          <div className="pwa-banner-copy">
            <strong>Mise à jour disponible</strong>
            <span>Une nouvelle version de la boutique est prête.</span>
          </div>
          <div className="pwa-banner-actions">
            <button type="button" className="pwa-btn" onClick={() => void updateServiceWorker(true)}>
              Actualiser
            </button>
            <button type="button" className="pwa-btn ghost" onClick={() => setNeedRefresh(false)}>
              Plus tard
            </button>
          </div>
        </div>
      )}

      {showInstall && (
        <div className="pwa-install-sheet" role="dialog" aria-label="Installer l’application">
          <img className="pwa-install-icon" src="/icons/icon-192.png" width={52} height={52} alt="" />
          <div className="pwa-banner-copy">
            <strong>Installer l’app MAJOR</strong>
            <span>{hint}</span>
          </div>
          <div className="pwa-banner-actions">
            {deferred && (
              <button type="button" className="pwa-btn" onClick={() => void install()}>
                Installer
              </button>
            )}
            <button type="button" className="pwa-btn ghost" onClick={dismissInstall}>
              Plus tard
            </button>
          </div>
        </div>
      )}
    </>
  );
}
