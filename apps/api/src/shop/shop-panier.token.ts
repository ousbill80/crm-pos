import { createHmac, timingSafeEqual } from 'node:crypto';

const SEP = '.';

export function signerPanierId(panierId: string, secret: string): string {
  const sig = createHmac('sha256', secret).update(panierId).digest('hex');
  return `${panierId}${SEP}${sig}`;
}

export function verifierPanierToken(
  token: string | undefined,
  secret: string,
): string | null {
  if (!token) return null;
  const idx = token.lastIndexOf(SEP);
  if (idx <= 0) return null;
  const panierId = token.slice(0, idx);
  const sig = token.slice(idx + 1);
  const expected = createHmac('sha256', secret).update(panierId).digest('hex');
  try {
    const a = Buffer.from(expected);
    const b = Buffer.from(sig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return panierId;
}
