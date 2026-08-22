// Utilitaires crypto legacy — déchiffrement one-shot des fiches client
// encore stockées en AES-GCM. Décision produit §6.7 : pas de chiffrement
// des fiches client au repos (mots de passe = bcrypt uniquement).
// Ne plus chiffrer à l’écriture.

import {
  createDecipheriv,
  createCipheriv,
  createHmac,
  randomBytes,
} from 'crypto';

const ALGORITHME = 'aes-256-gcm';
const TAILLE_IV = 12;
export const FORMAT_CHIFFRE =
  /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

function cle(): Buffer {
  const hex = process.env.CLIENT_DATA_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'CLIENT_DATA_ENCRYPTION_KEY manquante ou invalide (attendu : 32 octets en hexadécimal, soit 64 caractères).',
    );
  }
  return Buffer.from(hex, 'hex');
}

export function cleChiffrementConfiguree(): boolean {
  const hex = process.env.CLIENT_DATA_ENCRYPTION_KEY;
  return Boolean(hex && hex.length === 64);
}

export function estFormatChiffre(valeur: string): boolean {
  return FORMAT_CHIFFRE.test(valeur);
}

/** @deprecated Ne plus utiliser pour de nouvelles écritures. */
export function chiffrer(valeur: string): string {
  const iv = randomBytes(TAILLE_IV);
  const chiffreur = createCipheriv(ALGORITHME, cle(), iv);
  const ciphertext = Buffer.concat([
    chiffreur.update(valeur, 'utf8'),
    chiffreur.final(),
  ]);
  const authTag = chiffreur.getAuthTag();
  return [
    iv.toString('base64'),
    authTag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':');
}

export function dechiffrer(valeur: string): string {
  if (!estFormatChiffre(valeur)) {
    return valeur;
  }
  const [ivB64, authTagB64, ciphertextB64] = valeur.split(':');
  try {
    const dechiffreur = createDecipheriv(
      ALGORITHME,
      cle(),
      Buffer.from(ivB64, 'base64'),
    );
    dechiffreur.setAuthTag(Buffer.from(authTagB64, 'base64'));
    return Buffer.concat([
      dechiffreur.update(Buffer.from(ciphertextB64, 'base64')),
      dechiffreur.final(),
    ]).toString('utf8');
  } catch {
    throw new Error(
      'Déchiffrement impossible : donnée corrompue ou clé CLIENT_DATA_ENCRYPTION_KEY incorrecte.',
    );
  }
}

export function chiffrerNullable(
  valeur: string | null | undefined,
): string | null | undefined {
  if (valeur === null || valeur === undefined) return valeur;
  return chiffrer(valeur);
}

export function dechiffrerNullable(
  valeur: string | null | undefined,
): string | null | undefined {
  if (valeur === null || valeur === undefined) return valeur;
  return dechiffrer(valeur);
}

/** Chiffres seuls si le contact ressemble à un téléphone, sinon trim minuscule. */
export function normaliserContact(valeur: string): string {
  const digits = valeur.replace(/\D/g, '');
  return digits.length >= 8 ? digits : valeur.trim().toLowerCase();
}

/** @deprecated Index HMAC — remplacé par recherche plain-text contains. */
export function hasherContact(valeur: string): string {
  return createHmac('sha256', cle())
    .update(normaliserContact(valeur))
    .digest('hex');
}
