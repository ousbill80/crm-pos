import { useEffect, useRef } from 'react';

const TURNSTILE_SCRIPT =
  'https://challenges.cloudflare.com/turnstile/v0/api.js';

/** Site key publique du widget Turnstile MAJOR (dashboard Cloudflare). */
export const TURNSTILE_SITE_KEY_DEFAULT = '0x4AAAAAAEguWAI7JDLNxsRu';

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string;
          action?: string;
          callback: (token: string) => void;
          'expired-callback'?: () => void;
          'error-callback'?: () => void;
          theme?: 'light' | 'dark' | 'auto';
        },
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId?: string) => void;
    };
  }
}

let lastWidgetId: string | null = null;

export function turnstileSiteKey(): string | undefined {
  const fromEnv = import.meta.env.VITE_TURNSTILE_SITE_KEY;
  if (typeof fromEnv === 'string' && fromEnv.trim()) {
    return fromEnv.trim();
  }
  if (import.meta.env.PROD) {
    return TURNSTILE_SITE_KEY_DEFAULT;
  }
  return undefined;
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  const existing = document.querySelector<HTMLScriptElement>(
    `script[src="${TURNSTILE_SCRIPT}"]`,
  );
  if (existing) {
    return new Promise((resolve, reject) => {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () =>
        reject(new Error('Turnstile script')),
      );
    });
  }
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TURNSTILE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile script'));
    document.head.appendChild(script);
  });
}

type Props = {
  onToken: (token: string | null) => void;
};

/** Widget Cloudflare Turnstile — surface `login` (siteverify action=login). */
export function TurnstileWidget({ onToken }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = turnstileSiteKey();

  useEffect(() => {
    if (!siteKey || !hostRef.current) return;

    let cancelled = false;

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !hostRef.current || !window.turnstile) return;
        const id = window.turnstile.render(hostRef.current, {
          sitekey: siteKey,
          action: 'login',
          theme: 'auto',
          callback: (token) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
        widgetIdRef.current = id;
        lastWidgetId = id;
      })
      .catch(() => onToken(null));

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          /* ignore */
        }
      }
      if (lastWidgetId === widgetIdRef.current) {
        lastWidgetId = null;
      }
      widgetIdRef.current = null;
    };
  }, [siteKey, onToken]);

  if (!siteKey) return null;

  return (
    <div
      className="login-turnstile cf-turnstile"
      ref={hostRef}
      data-testid="login-turnstile"
      data-sitekey={siteKey}
      data-action="login"
    />
  );
}

/** Reset le widget après échec (jeton single-use). */
export function resetTurnstile(): void {
  if (!window.turnstile) return;
  try {
    window.turnstile.reset(lastWidgetId ?? undefined);
  } catch {
    /* ignore */
  }
}
