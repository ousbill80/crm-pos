/** Bloque clic droit + raccourcis DevTools sur les hôtes prod publics. */

function isProdPublicHost(): boolean {
  if (!import.meta.env.PROD) return false;
  const host = window.location.hostname.toLowerCase();
  if (host.includes('staging') || host === 'localhost' || host === '127.0.0.1') {
    return false;
  }
  return /(^|\.)majorautoparts\.shop$/i.test(host);
}

function isInspectShortcut(e: KeyboardEvent): boolean {
  const key = e.key.toLowerCase();
  const ctrlOrMeta = e.ctrlKey || e.metaKey;

  if (e.key === 'F12') return true;

  // Afficher le code source
  if (ctrlOrMeta && key === 'u') return true;

  // DevTools / inspecteur (Win/Linux + macOS)
  if (ctrlOrMeta && e.shiftKey && ['i', 'j', 'c', 'k'].includes(key)) return true;
  if (e.metaKey && e.altKey && ['i', 'j', 'c'].includes(key)) return true;

  return false;
}

export function installInspectGuard(): void {
  if (typeof window === 'undefined' || !isProdPublicHost()) return;

  const block = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };

  document.addEventListener('contextmenu', block, true);
  document.addEventListener(
    'keydown',
    (e) => {
      if (isInspectShortcut(e)) block(e);
    },
    true,
  );
}
