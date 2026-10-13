import { ShopPayoutWaveScheduler } from './shop-payout-wave.scheduler';

function payoutRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'payout-1',
    commandeWebId: 'cmd-1',
    referenceProvider: 'pt-1',
    tentatives: 0,
    montantNet: 985,
    mobileBeneficiaire: '+2250700000000',
    ...overrides,
  };
}

describe('ShopPayoutWaveScheduler', () => {
  function build() {
    const prisma = {
      payoutWave: { findMany: jest.fn(), update: jest.fn() },
      utilisateur: {
        findFirst: jest.fn().mockResolvedValue({ id: 'si-1' }),
      },
    };
    const audit = { record: jest.fn() };
    const waveAdapter = { verifierPayout: jest.fn() };
    const scheduler = new ShopPayoutWaveScheduler(
      prisma as never,
      audit as never,
      waveAdapter as never,
    );
    return { scheduler, prisma, audit, waveAdapter };
  }

  it('interroge uniquement les PayoutWave EN_COURS', async () => {
    const { scheduler, prisma, waveAdapter } = build();
    prisma.payoutWave.findMany.mockResolvedValue([]);
    await scheduler.sonderPayoutsEnCours();
    expect(prisma.payoutWave.findMany).toHaveBeenCalledWith({
      where: { statut: 'EN_COURS' },
    });
    expect(waveAdapter.verifierPayout).not.toHaveBeenCalled();
  });

  it('succeeded -> REUSSI + audit', async () => {
    const { scheduler, prisma, audit, waveAdapter } = build();
    prisma.payoutWave.findMany.mockResolvedValue([payoutRow()]);
    waveAdapter.verifierPayout.mockResolvedValue({ status: 'succeeded' });

    await scheduler.sonderPayoutsEnCours();

    expect(prisma.payoutWave.update).toHaveBeenCalledWith({
      where: { id: 'payout-1' },
      data: expect.objectContaining({ statut: 'REUSSI' }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYOUT_WAVE_REUSSI' }),
    );
  });

  it('failed -> ECHEC + erreurCode/Message + audit', async () => {
    const { scheduler, prisma, audit, waveAdapter } = build();
    prisma.payoutWave.findMany.mockResolvedValue([payoutRow()]);
    waveAdapter.verifierPayout.mockResolvedValue({
      status: 'failed',
      erreurCode: 'recipient-account-blocked',
    });

    await scheduler.sonderPayoutsEnCours();

    expect(prisma.payoutWave.update).toHaveBeenCalledWith({
      where: { id: 'payout-1' },
      data: expect.objectContaining({
        statut: 'ECHEC',
        erreurCode: 'recipient-account-blocked',
      }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYOUT_WAVE_ECHEC' }),
    );
  });

  it('processing -> incrémente tentatives sans changer le statut', async () => {
    const { scheduler, prisma, waveAdapter } = build();
    prisma.payoutWave.findMany.mockResolvedValue([payoutRow({ tentatives: 3 })]);
    waveAdapter.verifierPayout.mockResolvedValue({ status: 'processing' });

    await scheduler.sonderPayoutsEnCours();

    expect(prisma.payoutWave.update).toHaveBeenCalledWith({
      where: { id: 'payout-1' },
      data: { tentatives: 4 },
    });
  });

  it('processing au-delà du plafond (20 tentatives) -> ECHEC', async () => {
    const { scheduler, prisma, audit, waveAdapter } = build();
    prisma.payoutWave.findMany.mockResolvedValue([
      payoutRow({ tentatives: 19 }),
    ]);
    waveAdapter.verifierPayout.mockResolvedValue({ status: 'processing' });

    await scheduler.sonderPayoutsEnCours();

    expect(prisma.payoutWave.update).toHaveBeenCalledWith({
      where: { id: 'payout-1' },
      data: expect.objectContaining({ tentatives: 20, statut: 'ECHEC' }),
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'PAYOUT_WAVE_ECHEC' }),
    );
  });

  it('erreur réseau/HTTP sur verifierPayout -> ne touche pas la ligne', async () => {
    const { scheduler, prisma, waveAdapter } = build();
    prisma.payoutWave.findMany.mockResolvedValue([payoutRow()]);
    waveAdapter.verifierPayout.mockRejectedValue(new Error('503'));

    await expect(scheduler.sonderPayoutsEnCours()).resolves.toBeUndefined();
    expect(prisma.payoutWave.update).not.toHaveBeenCalled();
  });

  it('continue les lignes suivantes si une ligne échoue en erreur', async () => {
    const { scheduler, prisma, waveAdapter } = build();
    prisma.payoutWave.findMany.mockResolvedValue([
      payoutRow({ id: 'payout-1' }),
      payoutRow({ id: 'payout-2' }),
    ]);
    waveAdapter.verifierPayout
      .mockRejectedValueOnce(new Error('503'))
      .mockResolvedValueOnce({ status: 'succeeded' });

    await scheduler.sonderPayoutsEnCours();

    expect(prisma.payoutWave.update).toHaveBeenCalledTimes(1);
    expect(prisma.payoutWave.update).toHaveBeenCalledWith({
      where: { id: 'payout-2' },
      data: expect.objectContaining({ statut: 'REUSSI' }),
    });
  });
});
