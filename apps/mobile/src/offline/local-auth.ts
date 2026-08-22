import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import type { RoleLibelle } from '@caisse-crm/shared';

const CACHE_KEY = 'caisse-crm.offline.identifiants';
const ITERATIONS = 20_000;
const SALT_BYTES = 16;

// Fenêtre d'autonomie glissante (§6.7, décision validée avec l'utilisateur) :
// un identifiant mis en cache reste utilisable hors ligne 24h après sa
// dernière vérification réussie en ligne, pas indéfiniment.
export const FENETRE_AUTONOMIE_MS = 24 * 60 * 60 * 1000;

// Verrouillage local (miroir de la règle serveur §6.7 : 5 échecs → 15 min).
const MAX_TENTATIVES_ECHOUEES = 5;
const DUREE_VERROUILLAGE_MS = 15 * 60 * 1000;

interface IdentifiantCache {
  login: string;
  role: RoleLibelle;
  salt: string;
  hash: string;
  memoriseLe: number;
  tentativesEchouees: number;
  verrouJusqua: number | null;
  // Dernier JWT réel obtenu pour CE login lors d'un login en ligne réussi —
  // réutilisé pour authentifier les requêtes hors ligne (§6.7). Un JWT ne se
  // devine pas : le stocker ici n'ouvre aucune surface d'attaque nouvelle
  // par rapport au stockage déjà fait dans session.ts (même SecureStore).
  accessToken: string;
  mustChangePassword: boolean;
}

type Cache = Record<string, IdentifiantCache>;

export interface ResultatVerificationLocale {
  ok: boolean;
  role?: RoleLibelle;
  accessToken?: string;
  mustChangePassword?: boolean;
  /** Identifiant en cache mais fenêtre d'autonomie de 24h dépassée. */
  perime?: boolean;
  /** 5 échecs locaux atteints : verrouillage actif. */
  verrouille?: boolean;
  verrouJusqua?: number;
}

async function lireCache(): Promise<Cache> {
  const raw = await SecureStore.getItemAsync(CACHE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Cache;
  } catch {
    return {};
  }
}

async function ecrireCache(cache: Cache): Promise<void> {
  await SecureStore.setItemAsync(CACHE_KEY, JSON.stringify(cache));
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Dérivation « PBKDF2 maison » (§6.7) : étirement itératif SHA-256 salé.
 * Ce n'est pas une implémentation RFC 2898 au sens strict (pas de
 * construction HMAC) — c'est un coût de calcul délibéré contre une attaque
 * hors ligne sur le cache local, cohérent avec le niveau de risque déjà
 * accepté ailleurs dans l'app (voir plan de la tâche).
 */
async function deriverMotDePasse(
  password: string,
  saltHex: string,
): Promise<string> {
  let digest = `${saltHex}:${password}`;
  for (let i = 0; i < ITERATIONS; i += 1) {
    digest = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      `${digest}:${saltHex}:${i}`,
    );
  }
  return digest;
}

/**
 * À appeler après un login principal réussi en ligne (§6.7) — jamais avant
 * une confirmation réseau réelle. `accessToken` est le JWT obtenu à cet
 * instant, réutilisé tel quel (même une fois expiré) pour authentifier les
 * requêtes envoyées pendant une coupure ultérieure.
 */
export async function cacherIdentifiants(
  login: string,
  password: string,
  infos: {
    role: RoleLibelle;
    accessToken: string;
    mustChangePassword: boolean;
  },
): Promise<void> {
  const saltBytes = await Crypto.getRandomBytesAsync(SALT_BYTES);
  const salt = toHex(saltBytes);
  const hash = await deriverMotDePasse(password, salt);
  const cache = await lireCache();
  cache[login] = {
    login,
    role: infos.role,
    salt,
    hash,
    memoriseLe: Date.now(),
    tentativesEchouees: 0,
    verrouJusqua: null,
    accessToken: infos.accessToken,
    mustChangePassword: infos.mustChangePassword,
  };
  await ecrireCache(cache);
}

export async function verifierIdentifiantsLocal(
  login: string,
  password: string,
): Promise<ResultatVerificationLocale> {
  const cache = await lireCache();
  const entree = cache[login];
  if (!entree) return { ok: false };

  const maintenant = Date.now();

  if (entree.verrouJusqua && entree.verrouJusqua > maintenant) {
    return { ok: false, verrouille: true, verrouJusqua: entree.verrouJusqua };
  }

  if (maintenant - entree.memoriseLe > FENETRE_AUTONOMIE_MS) {
    return { ok: false, perime: true };
  }

  const hash = await deriverMotDePasse(password, entree.salt);
  if (hash !== entree.hash) {
    entree.tentativesEchouees += 1;
    entree.verrouJusqua =
      entree.tentativesEchouees >= MAX_TENTATIVES_ECHOUEES
        ? maintenant + DUREE_VERROUILLAGE_MS
        : null;
    cache[login] = entree;
    await ecrireCache(cache);
    return {
      ok: false,
      verrouille: entree.tentativesEchouees >= MAX_TENTATIVES_ECHOUEES,
      verrouJusqua: entree.verrouJusqua ?? undefined,
    };
  }

  entree.tentativesEchouees = 0;
  entree.verrouJusqua = null;
  cache[login] = entree;
  await ecrireCache(cache);
  return {
    ok: true,
    role: entree.role,
    accessToken: entree.accessToken,
    mustChangePassword: entree.mustChangePassword,
  };
}

/** Purge totale du cache d'identifiants hors ligne (déconnexion explicite). */
export async function purgerIdentifiantsCaches(): Promise<void> {
  await SecureStore.deleteItemAsync(CACHE_KEY);
}
