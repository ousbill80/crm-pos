import { Prisma } from '@prisma/client';
import type { CommandeWeb } from '@prisma/client';
import { ShopPspPayoutService } from './shop-psp-payout.service';

function commandeWeb(overrides: Partial<CommandeWeb> = {}): CommandeWeb {
  return {
    id: 'cmd-1',
    clientOperationId: 'op-1',
    providerPsp: 'WAVE',
    montantTotal: new Prisma.Decimal('1000.00'),
    ...overrides,
  } as CommandeWeb;
}

function parametreShop(overrides: Record<string, unknown> = {}) {
  return {
    waveCommissionPourcent: new Prisma.Decimal('1.5'),
    waveBeneficiaireMobile: '+2250700000000',
    waveBeneficiaireNom: 'Major Auto Parts',
    ...overrides,
  };
}

describe('ShopPspPayoutService', () => {
  function build() {
    const prisma = {
      parametreShop: { findFirst: jest.fn() },
      payoutWave: { create: jest.fn(), update: jest.fn() },
      utilisateur: {
        findFirst: jest.fn().mockResolvedValue({ id: 'si-1' }),
      },
    };
    const audit = { record: jest.fn() };
    const waveAdapter = { payout: jest.fn() };
    const service = new ShopPspPayoutService(
      prisma as never,
      audit as never,
      waveAdapter as never,
    );
    return { service, prisma, audit, waveAdapter };
  }

  it('ne fait rien si le provider n’est pas WAVE', async () => {
    const { service, prisma, waveAdapter } = build();
    await service.declencherPayout(commandeWeb({ providerPsp: 'PAYSTACK' }));
    expect(prisma.parametreShop.findFirst).not.toHaveBeenCalled();
    expect(waveAdapter.payout).not.toHaveBeenCalled();
  });

  it('ne fait rien si aucun bénéficiaire n’est configuré', async () => {
    const { service, prisma, waveAdapter } = build();
    prisma.parametreShop.findFirst.mockResolvedValue(
      parametreShop({ waveBeneficiaireMobile: null }),
    );
    await service.declencherPayout(commandeWeb());
    expect(prisma.payoutWave.create).not.toHaveBeenCalled();
    expect(waveAdapter.payout).not.toHaveBeenCalled();
  });

  it('ne fait rien si ParametreShop est introuvable', async () => {
    const { service, prisma, waveAdapter } = build();
    prisma.parametreShop.findFirst.mockResolvedValue(null);
    await service.declencherPayout(commandeWeb());
    expect(prisma.payoutWave.create).not.toHaveBeenCalled();
    expect(waveAdapter.payout).not.toHaveBeenCalled();
  });

  it('calcule la commission par défaut (1,5 %) et arrondit le net', async () => {
    const { service, prisma, waveAdapter } = build();
    prisma.parametreShop.findFirst.mockResolvedValue(parametreShop());
    prisma.payoutWave.create.mockResolvedValue({ id: 'payout-1' });
    waveAdapter.payout.mockResolvedValue({ id: 'pt-1', status: 'processing' });

    await service.declencherPayout(commandeWeb());

    expect(prisma.payoutWave.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commandeWebId: 'cmd-1',
        montantBrut: 1000,
        commissionPourcent: 1.5,
        commissionMontant: 15,
        montantNet: 985,
        mobileBeneficiaire: '+2250700000000',
        idempotencyKey: 'wave-payout:op-1',
      }),
    });
    expect(waveAdapter.payout).toHaveBeenCalledWith({
      mobile: '+2250700000000',
      montantNet: 985,
      idempotencyKey: 'wave-payout:op-1',
      clientReference: 'op-1',
      nom: 'Major Auto Parts',
    });
  });

  it('applique un taux de commission personnalisé', async () => {
    const { service, prisma, waveAdapter } = build();
    prisma.parametreShop.findFirst.mockResolvedValue(
      parametreShop({ waveCommissionPourcent: new Prisma.Decimal('3') }),
    );
    prisma.payoutWave.create.mockResolvedValue({ id: 'payout-1' });
    waveAdapter.payout.mockResolvedValue({ id: 'pt-1', status: 'processing' });

    await service.declencherPayout(commandeWeb());

    expect(prisma.payoutWave.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        commissionPourcent: 3,
        commissionMontant: 30,
        montantNet: 970,
      }),
    });
  });

  it('ignore silencieusement un doublon (contrainte unique commandeWebId)', async () => {
    const { service, prisma, waveAdapter } = build();
    prisma.parametreShop.findFirst.mockResolvedValue(parametreShop());
    prisma.payoutWave.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', {
        code: 'P2002',
        clientVersion: '6.19.3',
      }),
    );

    await expect(
      service.declencherPayout(commandeWeb()),
    ).resolves.toBeUndefined();
    expect(waveAdapter.payout).not.toHaveBeenCalled();
  });

  it('marque REUSSI quand Wave répond succeeded', async () => {
    const { service, prisma, audit, waveAdapter } = build();
    prisma.parametreShop.findFirst.mockResolvedValue(parametreShop());
    prisma.payoutWave.create.mockResolvedValue({ id: 'payout-1' });
    waveAdapter.payout.mockResolvedValue({ id: 'pt-1', status: 'succeeded' });

    await service.declencherPayout(commandeWeb());

    expect(prisma.payoutWave.update).toHaveBeenCalledWith({
      where: { id: 'payout-1' },
      data: expect.objectContaining({
        referenceProvider: 'pt-1',
        statut: 'REUSSI',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYOUT_WAVE_REUSSI' }),
    );
  });

  it('marque ECHEC avec erreurCode quand Wave répond failed', async () => {
    const { service, prisma, audit, waveAdapter } = build();
    prisma.parametreShop.findFirst.mockResolvedValue(parametreShop());
    prisma.payoutWave.create.mockResolvedValue({ id: 'payout-1' });
    waveAdapter.payout.mockResolvedValue({
      id: 'pt-1',
      status: 'failed',
      erreurCode: 'insufficient-funds',
    });

    await service.declencherPayout(commandeWeb());

    expect(prisma.payoutWave.update).toHaveBeenCalledWith({
      where: { id: 'payout-1' },
      data: expect.objectContaining({
        statut: 'ECHEC',
        erreurCode: 'insufficient-funds',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYOUT_WAVE_ECHEC' }),
    );
  });

  it('catche une erreur de l’adaptateur sans la propager, et marque ECHEC', async () => {
    const { service, prisma, waveAdapter } = build();
    prisma.parametreShop.findFirst.mockResolvedValue(parametreShop());
    prisma.payoutWave.create.mockResolvedValue({ id: 'payout-1' });
    waveAdapter.payout.mockRejectedValue(new Error('réseau indisponible'));

    await expect(
      service.declencherPayout(commandeWeb()),
    ).resolves.toBeUndefined();
    expect(prisma.payoutWave.update).toHaveBeenCalledWith({
      where: { id: 'payout-1' },
      data: expect.objectContaining({ statut: 'ECHEC' }),
    });
  });

  it('ne propage jamais une erreur inattendue (ex: ParametreShop.findFirst qui échoue)', async () => {
    const { service, prisma } = build();
    prisma.parametreShop.findFirst.mockRejectedValue(new Error('DB down'));

    await expect(
      service.declencherPayout(commandeWeb()),
    ).resolves.toBeUndefined();
  });
});
