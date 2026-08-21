import { getToken } from './auth-storage';

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// mustChangePassword n'est jamais mis dans le JWT (§6.7, décision produit :
// éviter un token périmé après un reset en cours de session côté serveur).
// Après un rechargement de page, l'état ne peut donc être ressuscité que via
// le premier 403 { code: 'MUST_CHANGE_PASSWORD' } renvoyé par
// PasswordChangeRequiredGuard sur n'importe quel endpoint protégé — d'où ce
// point d'écoute global, réarmé par AuthProvider.
let mustChangePasswordListener: (() => void) | null = null;

export function setMustChangePasswordListener(listener: (() => void) | null) {
  mustChangePasswordListener = listener;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 403 && body.includes('MUST_CHANGE_PASSWORD')) {
      mustChangePasswordListener?.();
    }
    throw new ApiError(res.status, body || res.statusText);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  return (await res.json()) as T;
}

// NestJS renvoie { message: string | string[] }. On expose le texte métier
// plutôt que le JSON brut pour les alertes POS / formulaires.
export function messageDepuisApi(err: unknown, fallback: string): string {
  if (!(err instanceof ApiError)) {
    return fallback;
  }
  try {
    const parsed = JSON.parse(err.message) as {
      message?: unknown;
      code?: string;
    };
    if (typeof parsed.message === 'string' && parsed.message.trim()) {
      return parsed.message;
    }
    if (
      parsed.message &&
      typeof parsed.message === 'object' &&
      parsed.message !== null &&
      'message' in parsed.message &&
      typeof (parsed.message as { message: unknown }).message === 'string'
    ) {
      return (parsed.message as { message: string }).message;
    }
    if (Array.isArray(parsed.message) && parsed.message.length > 0) {
      return parsed.message.map(String).join(' ');
    }
  } catch {
    // corps non JSON
  }
  if (err.message.trim() && err.message !== 'Bad Request') {
    return err.message;
  }
  return fallback;
}

export function codeDepuisApi(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  try {
    const parsed = JSON.parse(err.message) as {
      code?: unknown;
      message?: unknown;
    };
    if (typeof parsed.code === 'string') return parsed.code;
    if (
      parsed.message &&
      typeof parsed.message === 'object' &&
      parsed.message !== null &&
      'code' in parsed.message &&
      typeof (parsed.message as { code: unknown }).code === 'string'
    ) {
      return (parsed.message as { code: string }).code;
    }
  } catch {
    return null;
  }
  return null;
}

export function estErreurReseau(err: unknown): boolean {
  if (!(err instanceof ApiError)) return true;
  return err.status >= 500;
}

// Téléchargement d'un export fichier (CSV/PDF) authentifié — un lien <a
// href> classique ne porterait pas le Bearer token, d'où ce fetch + Blob.
export async function apiDownload(path: string, filename: string): Promise<void> {
  const token = getToken();

  const res = await fetch(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });

  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, body || res.statusText);
  }

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
