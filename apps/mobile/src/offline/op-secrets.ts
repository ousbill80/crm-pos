import * as SecureStore from 'expo-secure-store';

const STORE_KEY = 'caisse-crm.offline.opSecrets';

// Champs sensibles (mot de passe témoin/caissier) d'une op de la file
// hors-ligne — jamais persistés dans le corps de l'op elle-même (SQLite/
// IndexedDB, non chiffré côté web, cf. `packages/offline`). Stockés ici,
// chiffrés au repos (Keychain/Keystore via expo-secure-store), indexés par
// l'id de l'op, rehydratés dans le corps de la requête au seul moment de
// l'envoi puis purgés dès l'envoi réussi (§6.7 : « jamais journalisé »).
type SecretsParOp = Record<string, Record<string, string>>;

async function lire(): Promise<SecretsParOp> {
  const raw = await SecureStore.getItemAsync(STORE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as SecretsParOp;
  } catch {
    return {};
  }
}

async function ecrire(secrets: SecretsParOp): Promise<void> {
  await SecureStore.setItemAsync(STORE_KEY, JSON.stringify(secrets));
}

/** À appeler à l'enqueue d'une op dont le corps stocké omet des champs sensibles. */
export async function stasherSecretOp(
  opId: string,
  champs: Record<string, string>,
): Promise<void> {
  const secrets = await lire();
  secrets[opId] = champs;
  await ecrire(secrets);
}

/** Fusionne les champs sensibles stashés dans le corps, sans les retirer (retry possible). */
export async function rehydraterSecretOp(
  opId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const secrets = await lire();
  const champs = secrets[opId];
  if (!champs) return body;
  return { ...body, ...champs };
}

/** À appeler après l'envoi réussi de l'op — le secret ne doit pas survivre à la synchronisation. */
export async function purgerSecretOp(opId: string): Promise<void> {
  const secrets = await lire();
  if (!(opId in secrets)) return;
  delete secrets[opId];
  await ecrire(secrets);
}

/** Déconnexion explicite / nettoyage total (miroir de `purgerIdentifiantsCaches`). */
export async function purgerTousLesSecretsOp(): Promise<void> {
  await SecureStore.deleteItemAsync(STORE_KEY);
}
