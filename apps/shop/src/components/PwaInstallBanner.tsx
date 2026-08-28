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
    // iOS Safari
    ('standalone' in navigator && Boolean((navigator as Navigator & { standalone?: boolean }).standalone))
  );
}

/**
 * Bannière PWA : propose l’installation (beforeinstallprompt) et
 * le rechargement quand un nouveau service worker est prêt.
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
      // Vérifie les mises à jour périodiquement (onglet ouvert longtemps).
      window.setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
      void swUrl;
    },
  });

  useEffect(() => {
    if (isStandalone()) return;
    if (localStorage.getItem(DISMISS_KEY) === '1') return;

    const ua = navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|Chrome/.test(ua);

    function onBeforeInstall(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShowInstall(true);
      setIosHint(false);
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    if (isIos && isSafari) {
      setIosHint(true);
      setShowInstall(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
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

  if (needRefresh) {
    return (
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
    );
  }

  if (!showInstall) return null;

  return (
    <div className="pwa-banner" role="region" aria-label="Installer l’application">
      <div className="pwa-banner-copy">
        <strong>Installer MAJOR</strong>
        <span>
          {iosHint
            ? 'Sur iPhone : Partager → Sur l’écran d’accueil.'
            : 'Ajoutez la boutique à l’écran d’accueil pour un accès rapide.'}
        </span>
      </div>
      <div className="pwa-banner-actions">
        {deferred && (
          <button type="button" className="pwa-btn" onClick={() => void install()}>
            Installer
          </button>
        )}
        <button type="button" className="pwa-btn ghost" onClick={dismissInstall}>
          Fermer
        </button>
      </div>
    </div>
  );
}
