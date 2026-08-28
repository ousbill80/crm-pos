/** PWA install / display helpers. The service worker never caches the API (§6.7). */

export const PWA_INSTALL_DISMISS_KEY = 'caisse-crm.pwa.install-dismissed';

export const PWA_OFFLINE_COPY =
  'Réseau indisponible. Le point de vente peut encaisser hors ligne ; le reste de la gestion nécessite une connexion.';

export interface BeforeInstallPromptEventLike extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function isStandaloneDisplay(input: {
  displayModeStandalone: boolean;
  iosStandalone?: boolean;
}): boolean {
  return input.displayModeStandalone || input.iosStandalone === true;
}

export function isIosDevice(userAgent: string): boolean {
  return /iPad|iPhone|iPod/i.test(userAgent);
}

export function shouldShowInstallBanner(input: {
  canPrompt: boolean;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  return input.canPrompt && !input.standalone && !input.dismissed;
}

export function shouldShowIosInstallHint(input: {
  userAgent: string;
  standalone: boolean;
  dismissed: boolean;
}): boolean {
  if (input.standalone || input.dismissed) return false;
  return isIosDevice(input.userAgent);
}

export function readInstallDismissed(storage: Pick<Storage, 'getItem'>): boolean {
  return storage.getItem(PWA_INSTALL_DISMISS_KEY) === '1';
}

export function persistInstallDismissed(storage: Pick<Storage, 'setItem'>): void {
  storage.setItem(PWA_INSTALL_DISMISS_KEY, '1');
}

export function clearInstallDismissed(storage: Pick<Storage, 'removeItem'>): void {
  storage.removeItem(PWA_INSTALL_DISMISS_KEY);
}

type CanInstallListener = (canInstall: boolean) => void;

let deferredPrompt: BeforeInstallPromptEventLike | null = null;
const installListeners = new Set<CanInstallListener>();

function notifyInstallListeners(): void {
  const can = deferredPrompt != null;
  for (const listener of installListeners) listener(can);
}

export function subscribeCanInstall(listener: CanInstallListener): () => void {
  installListeners.add(listener);
  listener(deferredPrompt != null);
  return () => {
    installListeners.delete(listener);
  };
}

export function captureInstallPrompt(event: BeforeInstallPromptEventLike): void {
  event.preventDefault();
  deferredPrompt = event;
  notifyInstallListeners();
}

export function hasDeferredInstallPrompt(): boolean {
  return deferredPrompt != null;
}

export async function promptPwaInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null;
  notifyInstallListeners();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome;
}

export function resetPwaInstallState(): void {
  deferredPrompt = null;
  installListeners.clear();
}

export function bindBeforeInstallPrompt(target: EventTarget): () => void {
  const onPrompt = (event: Event) => {
    captureInstallPrompt(event as BeforeInstallPromptEventLike);
  };
  const onInstalled = () => {
    deferredPrompt = null;
    notifyInstallListeners();
  };
  target.addEventListener('beforeinstallprompt', onPrompt);
  target.addEventListener('appinstalled', onInstalled);
  return () => {
    target.removeEventListener('beforeinstallprompt', onPrompt);
    target.removeEventListener('appinstalled', onInstalled);
  };
}
