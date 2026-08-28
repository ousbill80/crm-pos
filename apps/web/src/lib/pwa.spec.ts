import { afterEach, describe, expect, it } from 'vitest';
import {
  bindBeforeInstallPrompt,
  captureInstallPrompt,
  hasDeferredInstallPrompt,
  isIosDevice,
  isStandaloneDisplay,
  persistInstallDismissed,
  PWA_INSTALL_DISMISS_KEY,
  PWA_OFFLINE_COPY,
  promptPwaInstall,
  readInstallDismissed,
  resetPwaInstallState,
  shouldShowInstallBanner,
  shouldShowIosInstallHint,
  subscribeCanInstall,
  type BeforeInstallPromptEventLike,
} from './pwa';

function fakePromptEvent(
  outcome: 'accepted' | 'dismissed' = 'accepted',
): BeforeInstallPromptEventLike {
  return {
    type: 'beforeinstallprompt',
    preventDefault() {},
    prompt: async () => {},
    userChoice: Promise.resolve({ outcome }),
  } as BeforeInstallPromptEventLike;
}

describe('affichage standalone', () => {
  it('détecte display-mode: standalone', () => {
    expect(
      isStandaloneDisplay({ displayModeStandalone: true, iosStandalone: false }),
    ).toBe(true);
  });

  it('détecte navigator.standalone iOS', () => {
    expect(
      isStandaloneDisplay({ displayModeStandalone: false, iosStandalone: true }),
    ).toBe(true);
  });

  it('reste en mode navigateur sinon', () => {
    expect(
      isStandaloneDisplay({ displayModeStandalone: false, iosStandalone: false }),
    ).toBe(false);
  });
});

describe('bannière d’installation', () => {
  it('s’affiche seulement si Chrome a proposé l’install et que l’app n’est pas déjà installée', () => {
    expect(
      shouldShowInstallBanner({
        canPrompt: true,
        standalone: false,
        dismissed: false,
      }),
    ).toBe(true);
    expect(
      shouldShowInstallBanner({
        canPrompt: true,
        standalone: true,
        dismissed: false,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallBanner({
        canPrompt: false,
        standalone: false,
        dismissed: false,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallBanner({
        canPrompt: true,
        standalone: false,
        dismissed: true,
      }),
    ).toBe(false);
  });

  it('propose le hint iOS Safari (pas de beforeinstallprompt)', () => {
    expect(isIosDevice('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)')).toBe(
      true,
    );
    expect(
      shouldShowIosInstallHint({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        standalone: false,
        dismissed: false,
      }),
    ).toBe(true);
    expect(
      shouldShowIosInstallHint({
        userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
        standalone: true,
        dismissed: false,
      }),
    ).toBe(false);
    expect(
      shouldShowIosInstallHint({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/128',
        standalone: false,
        dismissed: false,
      }),
    ).toBe(false);
  });
});

describe('persistance du refus d’installer', () => {
  it('écrit et relit la clé locale', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    };
    expect(readInstallDismissed(storage)).toBe(false);
    persistInstallDismissed(storage);
    expect(store.get(PWA_INSTALL_DISMISS_KEY)).toBe('1');
    expect(readInstallDismissed(storage)).toBe(true);
  });
});

describe('prompt d’installation Chrome', () => {
  afterEach(() => {
    resetPwaInstallState();
  });

  it('mémorise beforeinstallprompt puis le consomme une fois', async () => {
    const seen: boolean[] = [];
    const unsub = subscribeCanInstall((can) => seen.push(can));
    captureInstallPrompt(fakePromptEvent('accepted'));
    expect(hasDeferredInstallPrompt()).toBe(true);
    expect(await promptPwaInstall()).toBe('accepted');
    expect(hasDeferredInstallPrompt()).toBe(false);
    expect(await promptPwaInstall()).toBe('unavailable');
    unsub();
    expect(seen[0]).toBe(false);
    expect(seen).toContain(true);
    expect(seen.at(-1)).toBe(false);
  });

  it('écoute beforeinstallprompt / appinstalled sur la fenêtre', () => {
    const listeners = new Map<string, Set<EventListener>>();
    const target: EventTarget = {
      addEventListener(type, listener) {
        const set = listeners.get(type) ?? new Set();
        set.add(listener as EventListener);
        listeners.set(type, set);
      },
      removeEventListener(type, listener) {
        listeners.get(type)?.delete(listener as EventListener);
      },
      dispatchEvent(event) {
        for (const listener of listeners.get(event.type) ?? []) {
          listener(event);
        }
        return true;
      },
    };
    const stop = bindBeforeInstallPrompt(target);
    target.dispatchEvent(fakePromptEvent());
    expect(hasDeferredInstallPrompt()).toBe(true);
    target.dispatchEvent(new Event('appinstalled'));
    expect(hasDeferredInstallPrompt()).toBe(false);
    stop();
  });
});

describe('copie hors ligne', () => {
  it('rappelle le périmètre POS §6.7 et n’invente pas un CRM offline', () => {
    expect(PWA_OFFLINE_COPY).toMatch(/point de vente/i);
    expect(PWA_OFFLINE_COPY.toLowerCase()).not.toContain('crm hors ligne');
  });
});
