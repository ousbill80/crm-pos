import type { Response } from 'supertest';

/** Corps JSON typé — supertest laisse `response.body` en `any`. */
export function body<T>(response: Response): T {
  return response.body as T;
}

export function shopPanierCookie(res: Response): string {
  const raw: unknown = res.headers['set-cookie'];
  const list: string[] = Array.isArray(raw)
    ? raw.filter((item): item is string => typeof item === 'string')
    : typeof raw === 'string'
      ? [raw]
      : [];
  const line = list.find((cookie) => cookie.startsWith('shop_panier='));
  if (!line) throw new Error('Cookie panier absent');
  const pair = line.split(';')[0];
  if (!pair) throw new Error('Cookie panier illisible');
  return pair;
}
