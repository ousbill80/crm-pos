// Chiffrement applicatif des données client sensibles (§6.7 « chiffrement
// des données sensibles ») — AES-256-GCM, clé issue de
// CLIENT_DATA_ENCRYPTION_KEY (32 octets, hex). Utilisé par
// client-crypto-guard.ts pour chiffrer/déchiffrer Client.contact et
// Client.adresse de façon transparente au niveau du delegate Prisma.

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  createHmac,
} from 'crypto';

const ALGORITHME = 'aes-256-gcm';
const TAILLE_IV = 12;

function cle(): Buffer {
  const hex = process.env.CLIENT_DATA_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error(
      'CLIENT_DATA_ENCRYPTION_KEY manquante ou invalide (attendu : 32 octets en hexadécimal, soit 64 caractères).',
    );
  }
  return Buffer.from(hex, 'hex');
}

// Format de stockage : "iv:authTag:ciphertext" (chaque segment en base64),
// pour tenir dans la colonne String existante sans migration de type.
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

const FORMAT_CHIFFRE = /^[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/;

// Tolère les valeurs déjà présentes en clair avant l'activation du
// chiffrement (ex. données de dev saisies manuellement) : elles sont
// renvoyées telles quelles plutôt que de faire échouer la lecture, et seront
// rechiffrées à la prochaine écriture de la fiche.
export function dechiffrer(valeur: string): string {
  if (!FORMAT_CHIFFRE.test(valeur)) {
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

/** Index de recherche (POS) : HMAC du contact, jamais le clair. */
export function hasherContact(valeur: string): string {
  return createHmac('sha256', cle()).update(normaliserContact(valeur)).digest('hex');
}
