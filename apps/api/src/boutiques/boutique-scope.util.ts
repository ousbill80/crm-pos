import { ForbiddenException } from '@nestjs/common';
import type { AuthenticatedUser } from '../auth/types';
import { PrismaService } from '../prisma/prisma.service';

// ---------------------------------------------------------------------------
// Résolution de périmètre organisationnel (§4, §6.2) — utilitaire partagé
// entre les modules zones/boutiques/caisses. Fonction pure (pas un provider
// Nest) afin d'être importable depuis les trois modules sans créer de
// dépendance circulaire entre leurs Module Nest respectifs.
// ---------------------------------------------------------------------------

// Résout la zone de rattachement d'un utilisateur SUPERVISEUR_ZONE.
//
// LIMITE CONNUE DU SCHÉMA ACTUEL (à signaler, non contournée silencieusement) :
// le JWT/AuthenticatedUser ne porte pas de zoneId direct pour ce rôle — le
// seul lien disponible est Utilisateur.boutiqueId -> Boutique.zoneId. Or un
// Superviseur de zone n'est, dans l'organigramme réel (cf. Plan de
// structuration organisationnelle), pas nécessairement rattaché à UNE
// boutique précise : il supervise plusieurs boutiques d'une même zone. Si le
// compte n'a pas de boutiqueId renseigné, la zone de supervision ne peut
// PAS être déterminée proprement avec le schéma actuel. Dans ce cas précis,
// on refuse explicitement l'accès (403, journalisable) plutôt que d'inventer
// un accès réseau complet ou un contournement. Ce point doit être résolu par
// une évolution de schéma/auth (ex. Utilisateur.zoneId ou table de
// rattachement zone<->superviseur) hors du périmètre de ce module.
export async function resolveZoneScopeForSuperviseur(
  prisma: PrismaService,
  user: AuthenticatedUser,
): Promise<string> {
  if (!user.boutiqueId) {
    throw new ForbiddenException(
      "Le profil SUPERVISEUR_ZONE de cet utilisateur n'est rattaché à aucune " +
        'boutique : la zone de supervision ne peut pas être déterminée avec ' +
        'le schéma actuel (Utilisateur.boutiqueId est le seul lien disponible ' +
        'vers Boutique.zoneId). Contactez le Responsable SI.',
    );
  }

  const boutique = await prisma.boutique.findUnique({
    where: { id: user.boutiqueId },
    select: { zoneId: true },
  });

  if (!boutique) {
    throw new ForbiddenException(
      'La boutique de rattachement de cet utilisateur est introuvable.',
    );
  }

  return boutique.zoneId;
}

// Vérifie qu'un utilisateur RESPONSABLE_BOUTIQUE / CAISSIER_BOUTIQUE dispose
// bien d'un rattachement boutique exploitable, sinon refuse explicitement.
export function requireOwnBoutiqueId(user: AuthenticatedUser): string {
  if (!user.boutiqueId) {
    throw new ForbiddenException(
      "Ce profil n'est rattaché à aucune boutique : accès refusé.",
    );
  }
  return user.boutiqueId;
}
