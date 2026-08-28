import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { AccountingAiController } from './accounting-ai.controller';

jest.mock('@caisse-crm/shared', () => ({
  RoleLibelle: new Proxy({}, { get: (_target, key) => key.toString() }),
}));

describe('AccountingAiController role separation', () => {
  const roles = (method: keyof AccountingAiController) => {
    const handler: unknown = Reflect.get(
      AccountingAiController.prototype,
      method,
    );
    return (Reflect.getMetadata(ROLES_KEY, handler as object) ??
      []) as string[];
  };

  it('keeps RAF review separate from DAF policy approval', () => {
    expect(roles('createPolicy')).toEqual(['RAF_COMPTABLE']);
    expect(roles('decide')).toEqual(['RAF_COMPTABLE']);
    expect(roles('approvePolicy')).toEqual(['DAF']);
  });

  it('gives CONTROLEUR_INTERNE read-only access to the cockpit and policies', () => {
    expect(roles('list')).toContain('CONTROLEUR_INTERNE');
    expect(roles('listPolicies')).toContain('CONTROLEUR_INTERNE');
    expect(roles('dashboard')).toContain('CONTROLEUR_INTERNE');
    expect(roles('createPolicy')).not.toContain('CONTROLEUR_INTERNE');
    expect(roles('approvePolicy')).not.toContain('CONTROLEUR_INTERNE');
  });

  it('never grants accounting mutations to boutique roles', () => {
    for (const method of [
      'enqueue',
      'decide',
      'createPolicy',
      'approvePolicy',
      'assign',
      'resolve',
    ] as const) {
      expect(roles(method)).not.toContain('CAISSIER_BOUTIQUE');
      expect(roles(method)).not.toContain('RESPONSABLE_BOUTIQUE');
    }
  });
});
