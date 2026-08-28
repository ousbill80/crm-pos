import { BadRequestException } from '@nestjs/common';
import type { Boutique, ParametreShop } from '@prisma/client';

export interface EntrepotWebContext {
  parametreShop: Pick<ParametreShop, 'entrepotWebDefautId'>;
  boutiqueRetrait?: Pick<Boutique, 'entrepotWebId'> | null;
}

export function resoudreEntrepotWebId(
  modeFulfillment: 'RETRAIT_BOUTIQUE' | 'LIVRAISON',
  ctx: EntrepotWebContext,
): string {
  if (modeFulfillment === 'RETRAIT_BOUTIQUE') {
    const entrepotId =
      ctx.boutiqueRetrait?.entrepotWebId ??
      ctx.parametreShop.entrepotWebDefautId;
    if (!entrepotId) {
      throw new BadRequestException(
        'Aucun entrepôt web configuré pour le retrait en boutique.',
      );
    }
    return entrepotId;
  }

  const entrepotId = ctx.parametreShop.entrepotWebDefautId;
  if (!entrepotId) {
    throw new BadRequestException(
      'Aucun entrepôt web par défaut configuré pour la livraison.',
    );
  }
  return entrepotId;
}
