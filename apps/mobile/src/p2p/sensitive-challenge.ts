import type { SensitivePurpose } from '../api/p2p';

export function buildChallengeRequest(
  password: string,
  purpose: SensitivePurpose,
): { password: string; purpose: SensitivePurpose } {
  if (!password) throw new Error('Mot de passe requis.');
  return { password, purpose };
}

export function requireChallengeId(challengeId?: string): string {
  if (!challengeId) {
    throw new Error('Challenge de ré-authentification requis.');
  }
  return challengeId;
}
