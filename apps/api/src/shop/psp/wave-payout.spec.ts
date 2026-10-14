import { WaveAdapter } from './wave.adapter';

type FetchResult = {
  ok: boolean;
  status?: number;
  json: () => Promise<unknown>;
};
type FetchArgs = [input: string, init?: RequestInit];
type FetchMock = jest.Mock<Promise<FetchResult>, FetchArgs>;

function requeteEnvoyee(fetchMock: FetchMock): {
  url: string;
  init: RequestInit;
  body: Record<string, string>;
} {
  const [url, init] = fetchMock.mock.calls[0];
  const body = JSON.parse((init?.body as string | undefined) ?? '{}') as Record<
    string,
    string
  >;
  return { url, init: init ?? {}, body };
}

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

  function mockFetch(
    responseBody: unknown,
    ok = true,
    status = 200,
  ): FetchMock {
    const fetchMock: FetchMock = jest
      .fn<Promise<FetchResult>, FetchArgs>()
      .mockResolvedValue({
        ok,
        status,
        json: () => Promise.resolve(responseBody),
      });
    global.fetch = fetchMock as unknown as typeof fetch;
    return fetchMock;
  }

  describe('payout()', () => {
    it('envoie la requête Wave attendue avec Idempotency-Key', async () => {
      const fetchMock = mockFetch({
        id: 'pt-123',
        status: 'processing',
        fee: '5',
      });

      const result = await adapter().payout({
        mobile: '+2250700000000',
        montantNet: 985,
        idempotencyKey: 'wave-payout:op-1',
        clientReference: 'op-1',
        nom: 'Major Auto Parts',
      });

      const { url, init, body } = requeteEnvoyee(fetchMock);
      expect(url).toBe('https://api.wave.com/v1/payout');
      expect(init.method).toBe('POST');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer wave-test-key');
      expect(headers['Idempotency-Key']).toBe('wave-payout:op-1');
      expect(headers['Content-Type']).toBe('application/json');
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
      const fetchMock = mockFetch({ id: 'pt-1', status: 'succeeded' });

      await adapter().payout({
        mobile: '+2250700000000',
        montantNet: 985.6,
        idempotencyKey: 'k',
        clientReference: 'op-1',
      });

      const { body } = requeteEnvoyee(fetchMock);
      expect(body.receive_amount).toBe('986');
    });

    it('omet "name" du corps de la requête quand nom n’est pas fourni', async () => {
      const fetchMock = mockFetch({ id: 'pt-1', status: 'succeeded' });

      await adapter().payout({
        mobile: '+2250700000000',
        montantNet: 100,
        idempotencyKey: 'k',
        clientReference: 'op-1',
      });

      const { body } = requeteEnvoyee(fetchMock);
      expect(body.name).toBeUndefined();
    });

    it('tronque payment_reason à 40 caractères', async () => {
      const fetchMock = mockFetch({ id: 'pt-1', status: 'succeeded' });

      await adapter().payout({
        mobile: '+2250700000000',
        montantNet: 100,
        idempotencyKey: 'k',
        clientReference: 'op-1',
      });

      const { body } = requeteEnvoyee(fetchMock);
      expect(body.payment_reason.length).toBeLessThanOrEqual(40);
    });

    it('mappe une erreur de validation non réessayable (statut failed)', async () => {
      mockFetch({
        id: 'pt-err',
        status: 'failed',
        payout_error: { code: 'insufficient-funds' },
      });

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
      mockFetch({ message: 'unavailable' }, false, 503);

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
      const fetchMock = mockFetch({ id: 'pt-123', status: 'succeeded' });

      const result = await adapter().verifierPayout('pt-123');

      const { url, init } = requeteEnvoyee(fetchMock);
      expect(url).toBe('https://api.wave.com/v1/payout/pt-123');
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer wave-test-key');
      expect(result).toEqual({ status: 'succeeded' });
    });

    it('remonte erreurCode si failed', async () => {
      mockFetch({
        id: 'pt-123',
        status: 'failed',
        payout_error: { code: 'recipient-account-blocked' },
      });

      const result = await adapter().verifierPayout('pt-123');
      expect(result).toEqual({
        status: 'failed',
        erreurCode: 'recipient-account-blocked',
      });
    });

    it('lève une erreur réseau/HTTP (réessayable par l’appelant)', async () => {
      mockFetch({}, false, 500);

      await expect(adapter().verifierPayout('pt-123')).rejects.toThrow();
    });
  });
});
