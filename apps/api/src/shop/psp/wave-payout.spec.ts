import { WaveAdapter } from './wave.adapter';

describe('WaveAdapter payout', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function adapter() {
    return new WaveAdapter({
      get: (key: string) =>
        key === 'WAVE_API_KEY' ? 'wave-test-key' : undefined,
    } as never);
  }

  describe('payout()', () => {
    it('envoie la requête Wave attendue avec Idempotency-Key', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({ id: 'pt-123', status: 'processing', fee: '5' }),
      });
      global.fetch = fetchMock as never;

      const result = await adapter().payout({
        mobile: '+2250700000000',
        montantNet: 985,
        idempotencyKey: 'wave-payout:op-1',
        clientReference: 'op-1',
        nom: 'Major Auto Parts',
      });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.wave.com/v1/payout',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer wave-test-key',
            'Idempotency-Key': 'wave-payout:op-1',
            'Content-Type': 'application/json',
          }),
        }),
      );
      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      expect(body).toMatchObject({
        currency: 'XOF',
        mobile: '+2250700000000',
        receive_amount: '985',
        client_reference: 'op-1',
        payment_reason: 'Major Auto Parts',
      });
      expect(result).toEqual({ id: 'pt-123', status: 'processing' });
    });

    it('arrondit receive_amount à un entier', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'pt-1', status: 'succeeded' }),
      });
      global.fetch = fetchMock as never;

      await adapter().payout({
        mobile: '+2250700000000',
        montantNet: 985.6,
        idempotencyKey: 'k',
        clientReference: 'op-1',
      });

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      expect(body.receive_amount).toBe('986');
    });

    it('tronque payment_reason à 40 caractères', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'pt-1', status: 'succeeded' }),
      });
      global.fetch = fetchMock as never;

      await adapter().payout({
        mobile: '+2250700000000',
        montantNet: 100,
        idempotencyKey: 'k',
        clientReference: 'op-1',
      });

      const body = JSON.parse(
        (fetchMock.mock.calls[0][1] as { body: string }).body,
      );
      expect(body.payment_reason.length).toBeLessThanOrEqual(40);
    });

    it('mappe une erreur de validation non réessayable (statut failed)', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'pt-err',
            status: 'failed',
            payout_error: { code: 'insufficient-funds' },
          }),
      });
      global.fetch = fetchMock as never;

      const result = await adapter().payout({
        mobile: '+2250700000000',
        montantNet: 100,
        idempotencyKey: 'k',
        clientReference: 'op-1',
      });

      expect(result).toEqual({
        id: 'pt-err',
        status: 'failed',
        erreurCode: 'insufficient-funds',
      });
    });

    it('lève une erreur si WAVE_API_KEY absent', async () => {
      const noKeyAdapter = new WaveAdapter({
        get: () => undefined,
      } as never);
      await expect(
        noKeyAdapter.payout({
          mobile: '+2250700000000',
          montantNet: 100,
          idempotencyKey: 'k',
          clientReference: 'op-1',
        }),
      ).rejects.toThrow();
    });

    it('lève une erreur réseau/HTTP (réessayable par l’appelant)', async () => {
      global.fetch = jest
        .fn()
        .mockResolvedValue({
          ok: false,
          status: 503,
          json: () => Promise.resolve({ message: 'unavailable' }),
        }) as never;

      await expect(
        adapter().payout({
          mobile: '+2250700000000',
          montantNet: 100,
          idempotencyKey: 'k',
          clientReference: 'op-1',
        }),
      ).rejects.toThrow();
    });
  });

  describe('verifierPayout()', () => {
    it('interroge GET /v1/payout/:id et mappe le statut', async () => {
      const fetchMock = jest.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'pt-123', status: 'succeeded' }),
      });
      global.fetch = fetchMock as never;

      const result = await adapter().verifierPayout('pt-123');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.wave.com/v1/payout/pt-123',
        expect.objectContaining({
          headers: { Authorization: 'Bearer wave-test-key' },
        }),
      );
      expect(result).toEqual({ status: 'succeeded' });
    });

    it('remonte erreurCode si failed', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            id: 'pt-123',
            status: 'failed',
            payout_error: { code: 'recipient-account-blocked' },
          }),
      }) as never;

      const result = await adapter().verifierPayout('pt-123');
      expect(result).toEqual({
        status: 'failed',
        erreurCode: 'recipient-account-blocked',
      });
    });

    it('lève une erreur réseau/HTTP (réessayable par l’appelant)', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }) as never;

      await expect(adapter().verifierPayout('pt-123')).rejects.toThrow();
    });
  });
});
