import { ShopStockWebService } from './shop-stock-web.service';
import { StockService } from '../stocks/stock.service';

describe('ShopStockWebService', () => {
  const stockService = {
    getDisponible: jest.fn(),
  } as unknown as jest.Mocked<Pick<StockService, 'getDisponible'>>;

  const prisma = {
    boutique: { findMany: jest.fn() },
  };

  const service = new ShopStockWebService(
    prisma as never,
    stockService as never,
  );

  const params = {
    entrepotWebDefautId: 'hub-1',
    retraitActif: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('retourne le stock hub (retrait exposé à part)', async () => {
    stockService.getDisponible.mockImplementation(async (_id, entrepotId) => {
      if (entrepotId === 'hub-1') return 20;
      if (entrepotId === 'boutique-ext') return 0;
      return 0;
    });

    await expect(
      service.getStockWebDisponible('p1', 'ARTICLE', params),
    ).resolves.toBe(20);
  });

  it('retourne le hub même quand retrait inactif', async () => {
    stockService.getDisponible.mockResolvedValue(12);

    await expect(
      service.getStockWebDisponible('p1', 'ARTICLE', {
        ...params,
        retraitActif: false,
      }),
    ).resolves.toBe(12);
  });

  it('hub 0 reste 0', async () => {
    stockService.getDisponible.mockResolvedValue(0);

    await expect(
      service.getStockWebDisponible('p1', 'ARTICLE', params),
    ).resolves.toBe(0);
  });

  it('liste le PRINCIPAL si entrepotWebId est absent', async () => {
    prisma.boutique.findMany.mockResolvedValue([
      {
        id: 'b1',
        nom: 'Boutique Senteurs',
        adresse: 'Cocody',
        delaiRetraitHeures: 24,
        entrepotWebId: null,
        entrepots: [{ id: 'principal-1' }],
      },
      {
        id: 'b2',
        nom: 'Sans stock',
        adresse: 'Treichville',
        delaiRetraitHeures: null,
        entrepotWebId: null,
        entrepots: [],
      },
    ]);

    await expect(service.listBoutiquesRetraitAvecEntrepot()).resolves.toEqual([
      {
        boutiqueId: 'b1',
        nom: 'Boutique Senteurs',
        adresse: 'Cocody',
        delaiRetraitHeures: 24,
        entrepotId: 'principal-1',
      },
    ]);
    await expect(service.listEntrepotsRetraitWeb()).resolves.toEqual([
      'principal-1',
    ]);
  });
});
