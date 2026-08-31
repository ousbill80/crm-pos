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
    (prisma.boutique.findMany as jest.Mock).mockResolvedValue([
      { entrepotWebId: 'boutique-ext' },
    ]);
  });

  it('retourne min(hub, max retrait) quand retrait actif', async () => {
    stockService.getDisponible.mockImplementation(async (_id, entrepotId) => {
      if (entrepotId === 'hub-1') return 20;
      if (entrepotId === 'boutique-ext') return 0;
      return 0;
    });

    await expect(
      service.getStockWebDisponible('p1', 'ARTICLE', params),
    ).resolves.toBe(0);
  });

  it('retourne le hub seul quand retrait inactif', async () => {
    stockService.getDisponible.mockResolvedValue(12);

    await expect(
      service.getStockWebDisponible('p1', 'ARTICLE', {
        ...params,
        retraitActif: false,
      }),
    ).resolves.toBe(12);
    expect(prisma.boutique.findMany).not.toHaveBeenCalled();
  });

  it('hub 0 reste 0 même si boutique a du stock', async () => {
    stockService.getDisponible.mockImplementation(async (_id, entrepotId) => {
      if (entrepotId === 'hub-1') return 0;
      if (entrepotId === 'boutique-ext') return 5;
      return 0;
    });

    await expect(
      service.getStockWebDisponible('p1', 'ARTICLE', params),
    ).resolves.toBe(0);
  });
});
