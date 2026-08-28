import { BadRequestException, Injectable } from '@nestjs/common';
import {
  StatutCommandeAchat,
  StatutDemandeAchat,
  StatutFactureFournisseur,
  TRANSITIONS_COMMANDE_ACHAT,
  TRANSITIONS_DEMANDE_ACHAT,
  TRANSITIONS_FACTURE_FOURNISSEUR,
} from '@caisse-crm/shared';

// Machine à états unique du cycle Achats (commande / facture).
// Toute transition DOIT passer ici — jamais dupliquée dans un contrôleur.
@Injectable()
export class AchatsStateMachineService {
  assertDemande(depuis: StatutDemandeAchat, vers: StatutDemandeAchat): void {
    const permises = TRANSITIONS_DEMANDE_ACHAT[depuis] ?? [];
    if (!permises.includes(vers)) {
      throw new BadRequestException(
        `Transition demande d'achat "${depuis}" → "${vers}" non autorisée.`,
      );
    }
  }

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
