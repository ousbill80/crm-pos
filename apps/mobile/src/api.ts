import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { API_BASE_URL } from './api-config';

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const API_TIMEOUT_MS = 25_000;

async function fetchAvecTimeout(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const signalExterne = init.signal;
  const propagerAbort = () => controller.abort();
  signalExterne?.addEventListener('abort', propagerAbort, { once: true });
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new ApiError(
        0,
        'Délai API dépassé — vérifiez la connexion puis réessayez.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    signalExterne?.removeEventListener('abort', propagerAbort);
  }
}

let token: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function getToken(): string | null {
  return token;
}

export function setToken(value: string | null): void {
  token = value;
}

export function setUnauthorizedHandler(fn: (() => void) | null): void {
  onUnauthorized = fn;
}

/** Répertoire local inscriptible pour les téléchargements natifs (cache, à défaut documents). */
function nativeCacheDirectory(): string {
  const dir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!dir) {
    throw new ApiError(500, 'Stockage local indisponible sur cet appareil.');
  }
  return dir;
}

function parseErrorBody(text: string): { message: string; code?: string } {
  try {
    const json = JSON.parse(text) as {
      message?: string | string[];
      code?: string;
    };
    const raw = json.message;
    const message = Array.isArray(raw) ? raw.join(' ') : (raw ?? text);
    return { message: message || text, code: json.code };
  } catch {
    return { message: text };
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchAvecTimeout(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const { message, code } = parseErrorBody(text);
    if (res.status === 401 && path !== '/auth/login') {
      onUnauthorized?.();
    }
    throw new ApiError(res.status, message, code);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Télécharge un PDF authentifié puis ouvre le dialogue d’impression
 * (document réel, pas capture d’écran).
 */
export async function apiPrintPdf(path: string): Promise<void> {
  const res = await fetchAvecTimeout(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const { message, code } = parseErrorBody(text);
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, message, code);
  }

  if (Platform.OS !== 'web') {
    const filename = path.split('/').pop() ?? 'releve.pdf';
    try {
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}${path}`,
        `${nativeCacheDirectory()}${filename}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      await Print.printAsync({ uri: result.uri });
    } catch (err) {
      throw new ApiError(
        500,
        err instanceof Error && err.message
          ? `Impression PDF impossible : ${err.message}`
          : 'Impression PDF impossible.',
      );
    }
    return;
  }

  const blob = await res.blob();
  if (typeof document === 'undefined') {
    throw new ApiError(500, 'Impression PDF disponible sur le POS web.');
  }
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank', 'noopener,noreferrer');
  if (w) {
    const tryPrint = () => {
      try {
        w.focus();
        w.print();
      } catch {
        /* navigateur bloque parfois print immédiat */
      }
    };
    w.addEventListener('load', tryPrint);
    window.setTimeout(tryPrint, 600);
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    return;
  }
  // Fallback : téléchargement fichier
  const a = document.createElement('a');
  a.href = url;
  a.download = path.split('/').pop() ?? 'releve.pdf';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Télécharge un PDF (sans ouvrir l’imprimante). */
export async function apiDownloadPdf(
  path: string,
  filename: string,
): Promise<void> {
  const res = await fetchAvecTimeout(`${API_BASE_URL}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const { message, code } = parseErrorBody(text);
    if (res.status === 401) onUnauthorized?.();
    throw new ApiError(res.status, message, code);
  }

  if (Platform.OS !== 'web') {
    try {
      const result = await FileSystem.downloadAsync(
        `${API_BASE_URL}${path}`,
        `${nativeCacheDirectory()}${filename}`,
        { headers: token ? { Authorization: `Bearer ${token}` } : {} },
      );
      if (!(await Sharing.isAvailableAsync())) {
        throw new ApiError(500, 'Partage indisponible sur cet appareil.');
      }
      await Sharing.shareAsync(result.uri);
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw new ApiError(
        500,
        err instanceof Error && err.message
          ? `Téléchargement PDF impossible : ${err.message}`
          : 'Téléchargement PDF impossible.',
      );
    }
    return;
  }

  if (typeof document === 'undefined') {
    throw new ApiError(500, 'Téléchargement PDF disponible sur le POS web.');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
