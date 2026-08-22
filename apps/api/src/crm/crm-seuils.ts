import type { PrismaClient } from '@prisma/client';
import { SEUILS_CRM_DEFAUT, type SeuilsCrm } from './crm-thresholds.constants';

export async function lireSeuilsCrm(
  prisma: Pick<PrismaClient, 'societe'>,
): Promise<SeuilsCrm> {
  const societe = await prisma.societe.findFirst({
    select: {
      seuilFideliteArgent: true,
      seuilFideliteOr: true,
      seuilSegmentRegulier: true,
      seuilSegmentVip: true,
    },
  });
  if (!societe) return { ...SEUILS_CRM_DEFAUT };
  return {
    seuilFideliteArgent: societe.seuilFideliteArgent,
    seuilFideliteOr: societe.seuilFideliteOr,
    seuilSegmentRegulier: societe.seuilSegmentRegulier,
    seuilSegmentVip: societe.seuilSegmentVip,
  };
}
