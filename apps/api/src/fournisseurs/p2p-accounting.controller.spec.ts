import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { P2pAccountingController } from './p2p-accounting.controller';

jest.mock('@caisse-crm/shared', () => ({
  RoleLibelle: new Proxy(
    {},
    { get: (_target, property) => property.toString() },
  ),
}));

describe('P2pAccountingController RBAC', () => {
  const roles = (method: keyof P2pAccountingController) => {
    const handler: unknown = Reflect.get(
      P2pAccountingController.prototype,
      method,
    );
    return (Reflect.getMetadata(ROLES_KEY, handler as object) ??
      []) as string[];
  };

  it('separates preparation, approval, exception and execution', () => {
    expect(roles('preparePayment')).toEqual(['RAF_COMPTABLE']);
    expect(roles('postInvoice')).toEqual(['RAF_COMPTABLE']);
    expect(roles('openPeriod')).toEqual(['RAF_COMPTABLE']);
    expect(roles('approvePayment')).toEqual(['DAF']);
    expect(roles('closePeriod')).toEqual(['DAF']);
    expect(roles('approveException')).toEqual(['DIRECTION_GENERALE']);
    expect(roles('executePayment')).toEqual(['DAF', 'CAISSIER_CENTRAL']);
  });

  it('never authorizes a boutique role for accounting or supplier payment', () => {
    for (const method of [
      'preparePayment',
      'postInvoice',
      'approvePayment',
      'approveException',
      'executePayment',
      'reconcile',
      'openPeriod',
      'closePeriod',
      'openExercice',
      'backfillSales',
      'createJournal',
      'updateJournal',
    ] as const) {
      expect(roles(method)).not.toContain('CAISSIER_BOUTIQUE');
      expect(roles(method)).not.toContain('RESPONSABLE_BOUTIQUE');
    }
  });

  it('gives CONTROLEUR_INTERNE read-only reporting access', () => {
    expect(roles('trialBalance')).toContain('CONTROLEUR_INTERNE');
    expect(roles('generalLedger')).toContain('CONTROLEUR_INTERNE');
    expect(roles('supplierAging')).toContain('CONTROLEUR_INTERNE');
    expect(roles('customerAging')).toContain('CONTROLEUR_INTERNE');
    expect(roles('bilan')).toContain('CONTROLEUR_INTERNE');
    expect(roles('vatReturn')).toContain('CONTROLEUR_INTERNE');
    expect(roles('liasse')).toContain('CONTROLEUR_INTERNE');
    expect(roles('liassePdf')).toContain('CONTROLEUR_INTERNE');
    expect(roles('liasseAgregat')).toContain('CONTROLEUR_INTERNE');
    expect(roles('liasse')).not.toContain('CAISSIER_BOUTIQUE');
    expect(roles('liasseAgregat')).not.toContain('RESPONSABLE_BOUTIQUE');
    expect(roles('listAccounts')).toContain('CONTROLEUR_INTERNE');
    expect(roles('listQueue')).toContain('CONTROLEUR_INTERNE');
    expect(roles('listPeriods')).toContain('CONTROLEUR_INTERNE');
    expect(roles('listExercices')).toContain('CONTROLEUR_INTERNE');
    expect(roles('listJournals')).toContain('CONTROLEUR_INTERNE');
    expect(roles('createJournal')).toEqual(['RAF_COMPTABLE']);
    expect(roles('updateJournal')).toEqual(['RAF_COMPTABLE']);
    expect(roles('preparePayment')).not.toContain('CONTROLEUR_INTERNE');
    expect(roles('openPeriod')).not.toContain('CONTROLEUR_INTERNE');
    expect(roles('openExercice')).not.toContain('CONTROLEUR_INTERNE');
    expect(roles('closePeriod')).not.toContain('CONTROLEUR_INTERNE');
    expect(roles('createJournal')).not.toContain('CONTROLEUR_INTERNE');
  });

  it('reserves CoA, OD and queue flush for RAF, year-end for DAF', () => {
    expect(roles('createAccount')).toEqual(['RAF_COMPTABLE']);
    expect(roles('createNature')).toEqual(['RAF_COMPTABLE']);
    expect(roles('postManual')).toEqual(['RAF_COMPTABLE']);
    expect(roles('letterLines')).toEqual(['RAF_COMPTABLE']);
    expect(roles('stornoEntry')).toEqual(['RAF_COMPTABLE']);
    expect(roles('listOpenLettering')).toContain('CONTROLEUR_INTERNE');
    expect(roles('listOpenLettering')).not.toContain('CAISSIER_BOUTIQUE');
    expect(roles('letterLines')).not.toContain('CAISSIER_BOUTIQUE');
    expect(roles('stornoEntry')).not.toContain('DAF');
    expect(roles('flushQueue')).toEqual(['RAF_COMPTABLE']);
    expect(roles('backfillSales')).toEqual(['RAF_COMPTABLE']);
    expect(roles('openExercice')).toEqual(['RAF_COMPTABLE']);
    expect(roles('closeExercice')).toEqual(['DAF']);
    expect(roles('bilan')).not.toContain('CAISSIER_BOUTIQUE');
    expect(roles('postManual')).not.toContain('CAISSIER_BOUTIQUE');
    expect(roles('closeExercice')).not.toContain('RESPONSABLE_BOUTIQUE');
    expect(roles('createAccount')).not.toContain('DAF');
  });
});
