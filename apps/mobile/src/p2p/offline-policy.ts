import type { OutboxOp } from '@caisse-crm/offline';

export type P2pMutationClass = 'TERRAIN_ALLOWED' | 'ONLINE_ONLY';

const TERRAIN_PATHS = [
  /^\/achats\/receptions$/,
  /^\/achats\/receptions\/[^/]+\/qualite$/,
  /^\/achats\/receptions\/[^/]+\/putaway$/,
  /^\/achats\/receptions\/[^/]+\/retours$/,
  /^\/achats\/receptions\/retours\/[^/]+\/expedier$/,
];

const ONLINE_ONLY_MARKERS = [
  '/approuver',
  '/approuver-exception',
  '/exception',
  '/comptabiliser',
  '/paiements',
  '/executer',
  '/accounting-ai/',
];

export function classifyP2pMutation(path: string): P2pMutationClass {
  if (ONLINE_ONLY_MARKERS.some((marker) => path.includes(marker))) {
    return 'ONLINE_ONLY';
  }
  return TERRAIN_PATHS.some((pattern) => pattern.test(path))
    ? 'TERRAIN_ALLOWED'
    : 'ONLINE_ONLY';
}

export async function enqueueTerrainP2p(
  path: string,
  body: Record<string, unknown>,
): Promise<OutboxOp> {
  if (classifyP2pMutation(path) !== 'TERRAIN_ALLOWED') {
    throw new Error('Cette action sensible ne peut jamais être mise en file hors ligne.');
  }
  const clientOperationId =
    typeof body.clientOperationId === 'string' ? body.clientOperationId : undefined;
  if (!clientOperationId) {
    throw new Error('clientOperationId est obligatoire pour la file terrain.');
  }
  const [{ enqueueOp, getOfflineStore }, { stasherSecretOp, purgerSecretOp }] =
    await Promise.all([
      import('@caisse-crm/offline'),
      import('../offline/op-secrets'),
    ]);
  // La charge métier (lots, séries, preuves) reste chiffrée dans
  // Keychain/Keystore. SQLite ne conserve qu'un marqueur et l'identifiant.
  await stasherSecretOp(clientOperationId, { $body: JSON.stringify(body) });
  try {
    return await enqueueOp(getOfflineStore(), {
      id: clientOperationId,
      path,
      method: 'POST',
      body: { clientOperationId, securePayload: true },
    });
  } catch (error) {
    // Évite un secret orphelin si l'écriture de file échoue.
    await purgerSecretOp(clientOperationId);
    throw error;
  }
}
