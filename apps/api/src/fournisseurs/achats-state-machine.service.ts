import { BadRequestException, Injectable } from '@nestjs/common';
import {
  StatutCommandeAchat,
  StatutFactureFournisseur,
  TRANSITIONS_COMMANDE_ACHAT,
  TRANSITIONS_FACTURE_FOURNISSEUR,
} from '@caisse-crm/shared';

// Machine à états unique du cycle Achats (commande / facture).
// Toute transition DOIT passer ici — jamais dupliquée dans un contrôleur.
@Injectable()
export class AchatsStateMachineService {
  assertCommande(depuis: StatutCommandeAchat, vers: StatutCommandeAchat): void {
    const permises = TRANSITIONS_COMMANDE_ACHAT[depuis] ?? [];
    if (!permises.includes(vers)) {
      throw new BadRequestException(
        `Transition commande "${depuis}" → "${vers}" non autorisée.`,
      );
    }
  }

  assertFacture(
    depuis: StatutFactureFournisseur,
    vers: StatutFactureFournisseur,
  ): void {
    const permises = TRANSITIONS_FACTURE_FOURNISSEUR[depuis] ?? [];
    if (!permises.includes(vers)) {
      throw new BadRequestException(
        `Transition facture "${depuis}" → "${vers}" non autorisée.`,
      );
    }
  }
}
