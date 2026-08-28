import { ForbiddenException } from '@nestjs/common';
import { RoleLibelle } from '@caisse-crm/shared';
import type { AuthenticatedUser } from '../auth/types';

/** Périmètre magasin — §4 / §6.2 : caissier et responsable boutique. */
const ROLES_BOUTIQUE_COMMANDES_WEB: RoleLibelle[] = [
  RoleLibelle.RESPONSABLE_BOUTIQUE,
  RoleLibelle.CAISSIER_BOUTIQUE,
];

export function estRoleBoutiqueCommandesWeb(role: RoleLibelle): boolean {
  return ROLES_BOUTIQUE_COMMANDES_WEB.includes(role);
}

/** Filtre Prisma : click & collect de la boutique rattachée uniquement. */
export function wherePerimetreCommandesWeb(user: AuthenticatedUser): {
  boutiqueRetraitId?: string;
} {
  if (!estRoleBoutiqueCommandesWeb(user.role)) {
    return {};
  }
  if (!user.boutiqueId) {
    throw new ForbiddenException(
      "Ce profil n'est rattaché à aucune boutique : accès refusé.",
    );
  }
  return { boutiqueRetraitId: user.boutiqueId };
}

export function assertCommandeWebAccessible(
  cmd: { boutiqueRetraitId: string | null },
  user: AuthenticatedUser,
): void {
  if (!estRoleBoutiqueCommandesWeb(user.role)) {
    return;
  }
  if (!user.boutiqueId) {
    throw new ForbiddenException(
      "Ce profil n'est rattaché à aucune boutique : accès refusé.",
    );
  }
  if (cmd.boutiqueRetraitId !== user.boutiqueId) {
    throw new ForbiddenException("Commande d'une autre boutique.");
  }
}
