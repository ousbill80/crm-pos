import { createHmac } from 'node:crypto';
import { WaveAdapter } from './wave.adapter';

function waveSignature(
  secret: string,
  timestamp: string,
  rawBody: string,
): string {
  return createHmac('sha256', secret)
    .update(timestamp + rawBody)
    .digest('hex');
}

describe('WaveAdapter signature', () => {
  const adapter = new WaveAdapter({
    get: (key: string) =>
      key === 'WAVE_WEBHOOK_SECRET' ? 'wave-test-secret' : undefined,
  } as never);

  function body(overrides: Partial<Record<string, unknown>> = {}) {
    return Buffer.from(
      JSON.stringify({
        id: 'EV_1',
        type: 'checkout.session.completed',
        data: {
          id: 'cos-18qq25rgr100a',
          amount: '1000',
          currency: 'XOF',
          payment_status: 'succeeded',
          checkout_status: 'complete',
          client_reference: 'ref-1',
          transaction_id: 'TCN4Y4ZC3FM',
          ...overrides,
        },
      }),
    );
  }

  it('accepte une signature valide et mappe les champs Wave', () => {
    const raw = body();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = waveSignature(
      'wave-test-secret',
      timestamp,
      raw.toString('utf8'),
    );
    const ev = adapter.verifierWebhook(
      { 'wave-signature': `t=${timestamp},v1=${sig}` },
      raw,
    );
    expect(ev?.reference).toBe('ref-1');
    expect(ev?.providerReference).toBe('cos-18qq25rgr100a');
    expect(ev?.montant).toBe(1000);
    expect(ev?.type).toBe('checkout.session.completed');
  });

  it('rejette une signature invalide', () => {
    const raw = body();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const ev = adapter.verifierWebhook(
      { 'wave-signature': `t=${timestamp},v1=deadbeef` },
      raw,
    );
    expect(ev).toBeNull();
  });

  it('rejette un timestamp trop ancien (> 5 min)', () => {
    const raw = body();
    const timestamp = (Math.floor(Date.now() / 1000) - 400).toString();
    const sig = waveSignature(
      'wave-test-secret',
      timestamp,
      raw.toString('utf8'),
    );
    const ev = adapter.verifierWebhook(
      { 'wave-signature': `t=${timestamp},v1=${sig}` },
      raw,
    );
    expect(ev).toBeNull();
  });

  it('rejette un timestamp trop futur (> 30s)', () => {
    const raw = body();
    const timestamp = (Math.floor(Date.now() / 1000) + 60).toString();
    const sig = waveSignature(
      'wave-test-secret',
      timestamp,
      raw.toString('utf8'),
    );
    const ev = adapter.verifierWebhook(
      { 'wave-signature': `t=${timestamp},v1=${sig}` },
      raw,
    );
    expect(ev).toBeNull();
  });

  it('rejette un événement non abouti (payment_status != succeeded)', () => {
    const raw = body({ payment_status: 'processing' });
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const sig = waveSignature(
      'wave-test-secret',
      timestamp,
      raw.toString('utf8'),
    );
    const ev = adapter.verifierWebhook(
      { 'wave-signature': `t=${timestamp},v1=${sig}` },
      raw,
    );
    expect(ev).toBeNull();
  });
});
