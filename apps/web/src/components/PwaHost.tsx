import { useEffect, useState } from 'react';
import { Download, RefreshCw, WifiOff, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import {
  bindBeforeInstallPrompt,
  isStandaloneDisplay,
  persistInstallDismissed,
  promptPwaInstall,
  PWA_OFFLINE_COPY,
  readInstallDismissed,
  shouldShowInstallBanner,
  shouldShowIosInstallHint,
  subscribeCanInstall,
} from '../lib/pwa';

function useStandalone(): boolean {
  const [standalone, setStandalone] = useState(() =>
    isStandaloneDisplay({
      displayModeStandalone: window.matchMedia('(display-mode: standalone)').matches,
      iosStandalone: Boolean(
        (navigator as Navigator & { standalone?: boolean }).standalone,
      ),
    }),
  );

  useEffect(() => {
    const mq = window.matchMedia('(display-mode: standalone)');
    const sync = () =>
      setStandalone(
        isStandaloneDisplay({
          displayModeStandalone: mq.matches,
          iosStandalone: Boolean(
            (navigator as Navigator & { standalone?: boolean }).standalone,
          ),
        }),
      );
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  return standalone;
}

/**
 * Shell PWA : installation, hors-ligne (POS only §6.7), mise à jour du service worker.
 * Les appels API ne sont jamais servis depuis le cache (NetworkOnly).
 */
export function PwaHost() {
  const standalone = useStandalone();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      window.setInterval(() => {
        void registration.update();
      }, 60 * 60 * 1000);
    },
  });

  const [canInstall, setCanInstall] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [dismissed, setDismissed] = useState(() =>
    readInstallDismissed(localStorage),
  );

  useEffect(() => bindBeforeInstallPrompt(window), []);
  useEffect(() => subscribeCanInstall(setCanInstall), []);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  function dismissInstall() {
    persistInstallDismissed(localStorage);
    setDismissed(true);
  }

  const showInstall = shouldShowInstallBanner({
    canPrompt: canInstall,
    standalone,
    dismissed,
  });
  const showIos = shouldShowIosInstallHint({
    userAgent: navigator.userAgent,
    standalone,
    dismissed,
  });

  return (
    <div className="pwa-toasts" aria-live="polite">
      {!online && (
        <div className="pwa-toast pwa-toast-offline" role="status">
          <WifiOff size={16} aria-hidden />
          <p>{PWA_OFFLINE_COPY}</p>
        </div>
      )}

      {offlineReady && online && (
        <div className="pwa-toast" role="status">
          <p>Application disponible hors ligne (caisse). Le reste de la gestion reste en ligne.</p>
          <button type="button" className="pwa-toast-icon" onClick={() => setOfflineReady(false)} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
      )}

      {needRefresh && (
        <div className="pwa-toast pwa-toast-update" role="status">
          <p>Une nouvelle version de CaissePOS est prête.</p>
          <button
            type="button"
            className="btn-primary pwa-toast-action"
            onClick={() => void updateServiceWorker(true)}
          >
            <RefreshCw size={14} aria-hidden />
            Mettre à jour
          </button>
          <button type="button" className="pwa-toast-icon" onClick={() => setNeedRefresh(false)} aria-label="Plus tard">
            <X size={16} />
          </button>
        </div>
      )}

      {showInstall && (
        <div className="pwa-toast pwa-toast-install" role="dialog" aria-label="Installer l’application">
          <p>
            Installer <strong>CaissePOS</strong> sur cet appareil — caisse et gestion, comme une application.
          </p>
          <button
            type="button"
            className="btn-primary pwa-toast-action"
            onClick={() => void promptPwaInstall()}
          >
            <Download size={14} aria-hidden />
            Installer
          </button>
          <button type="button" className="pwa-toast-icon" onClick={dismissInstall} aria-label="Ne pas installer">
            <X size={16} />
          </button>
        </div>
      )}

      {showIos && (
        <div className="pwa-toast pwa-toast-install" role="dialog" aria-label="Ajouter à l’écran d’accueil">
          <p>
            Sur iPhone / iPad : bouton <strong>Partager</strong> puis <strong>Sur l’écran d’accueil</strong>.
          </p>
          <button type="button" className="pwa-toast-icon" onClick={dismissInstall} aria-label="Fermer">
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
