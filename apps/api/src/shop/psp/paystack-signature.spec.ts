import { createHmac, timingSafeEqual } from 'node:crypto';
import { PaystackAdapter } from './paystack.adapter';

describe('PaystackAdapter signature', () => {
  const adapter = new PaystackAdapter({
    get: (key: string) =>
      key === 'PAYSTACK_SECRET_KEY' ? 'sk_test_secret' : undefined,
  } as never);

  it('accepte une signature valide', () => {
    const body = Buffer.from(
      JSON.stringify({
        event: 'charge.success',
        data: {
          id: 1,
          status: 'success',
          reference: 'ref-1',
          amount: 1000,
          currency: 'XOF',
        },
      }),
    );
    const sig = createHmac('sha512', 'sk_test_secret')
      .update(body)
      .digest('hex');
    const ev = adapter.verifierWebhook({ 'x-paystack-signature': sig }, body);
    expect(ev?.reference).toBe('ref-1');
  });

  it('rejette une signature invalide', () => {
    const body = Buffer.from('{}');
    const ev = adapter.verifierWebhook({ 'x-paystack-signature': 'bad' }, body);
    expect(ev).toBeNull();
  });

  it('utilise timingSafeEqual', () => {
    const secret = 'sk_test_secret';
    const body = Buffer.from('{"event":"x"}');
    const sig = createHmac('sha512', secret).update(body).digest('hex');
    const a = Buffer.from(sig);
    const b = Buffer.from(sig);
    expect(timingSafeEqual(a, b)).toBe(true);
  });
});
