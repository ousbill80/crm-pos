import { ForbiddenException } from '@nestjs/common';
import { RoleLibelle } from '@caisse-crm/shared';
import type { AuthenticatedUser } from '../auth/types';
import {
  assertCommandeWebAccessible,
  estRoleBoutiqueCommandesWeb,
  wherePerimetreCommandesWeb,
} from './commandes-web.scope';

function user(role: RoleLibelle, boutiqueId: string | null): AuthenticatedUser {
  return { userId: 'u1', login: 't', role, boutiqueId };
}

describe('commandes-web.scope (§4 / PLAN-E-COMMERCE click & collect)', () => {
  it('identifie les rôles à périmètre boutique', () => {
    expect(estRoleBoutiqueCommandesWeb(RoleLibelle.CAISSIER_BOUTIQUE)).toBe(
      true,
    );
    expect(estRoleBoutiqueCommandesWeb(RoleLibelle.RESPONSABLE_BOUTIQUE)).toBe(
      true,
    );
    expect(estRoleBoutiqueCommandesWeb(RoleLibelle.RESPONSABLE_SI)).toBe(false);
    expect(estRoleBoutiqueCommandesWeb(RoleLibelle.DAF)).toBe(false);
  });

  it('ne restreint pas la liste pour un rôle réseau', () => {
    expect(
      wherePerimetreCommandesWeb(user(RoleLibelle.RESPONSABLE_SI, null)),
    ).toEqual({});
  });

  it('restreint la liste à boutiqueRetraitId pour le caissier boutique', () => {
    expect(
      wherePerimetreCommandesWeb(
        user(RoleLibelle.CAISSIER_BOUTIQUE, 'boutique-a'),
      ),
    ).toEqual({ boutiqueRetraitId: 'boutique-a' });
  });

  it('refuse un profil boutique sans rattachement', () => {
    expect(() =>
      wherePerimetreCommandesWeb(user(RoleLibelle.CAISSIER_BOUTIQUE, null)),
    ).toThrow(ForbiddenException);
  });

  it('interdit au caissier d’accéder à une commande d’une autre boutique', () => {
    expect(() =>
      assertCommandeWebAccessible(
        { boutiqueRetraitId: 'boutique-b' },
        user(RoleLibelle.CAISSIER_BOUTIQUE, 'boutique-a'),
      ),
    ).toThrow(ForbiddenException);
  });

  it('autorise le caissier sur sa propre commande de retrait', () => {
    expect(() =>
      assertCommandeWebAccessible(
        { boutiqueRetraitId: 'boutique-a' },
        user(RoleLibelle.CAISSIER_BOUTIQUE, 'boutique-a'),
      ),
    ).not.toThrow();
  });
});
