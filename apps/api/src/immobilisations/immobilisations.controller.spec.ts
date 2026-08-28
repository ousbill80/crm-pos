import { ROLES_KEY } from '../auth/decorators/roles.decorator';
import { ImmobilisationsController } from './immobilisations.controller';

jest.mock('@caisse-crm/shared', () => ({
  RoleLibelle: new Proxy(
    {},
    { get: (_target, property) => property.toString() },
  ),
}));

describe('ImmobilisationsController RBAC', () => {
  const roles = (method: keyof ImmobilisationsController) => {
    const handler: unknown = Reflect.get(
      ImmobilisationsController.prototype,
      method,
    );
    return (Reflect.getMetadata(ROLES_KEY, handler as object) ??
      []) as string[];
  };

  it('lets the auditor read the register and forbids boutique roles', () => {
    expect(roles('list')).toContain('CONTROLEUR_INTERNE');
    expect(roles('list')).not.toContain('CAISSIER_BOUTIQUE');
    expect(roles('create')).toEqual(['RAF_COMPTABLE']);
    expect(roles('sortir')).toEqual(['RAF_COMPTABLE']);
    expect(roles('create')).not.toContain('CAISSIER_BOUTIQUE');
    expect(roles('sortir')).not.toContain('RESPONSABLE_BOUTIQUE');
  });

  it('lets RAF or DAF generate monthly depreciation, not the boutique', () => {
    expect(roles('generer')).toEqual(['RAF_COMPTABLE', 'DAF']);
    expect(roles('generer')).not.toContain('CAISSIER_BOUTIQUE');
    expect(roles('generer')).not.toContain('CONTROLEUR_INTERNE');
  });
});
