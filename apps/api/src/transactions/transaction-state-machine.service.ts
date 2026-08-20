import { BadRequestException, Injectable } from '@nestjs/common';
import { StatutTransaction, TRANSITIONS_AUTORISEES } from '@caisse-crm/shared';

// Objet de domaine unique portant la machine à états des transactions de
// caisse (§6.4 du cahier des charges) :
//
//   INITIEE -> EN_TRANSIT -> RECEPTIONNEE -> VALIDEE
//                                          -> LITIGE
//
// Toute action de TransactionsService qui fait évoluer le statut d'une
// TransactionCaisse DOIT passer par ce service — aucune logique de
// transition ne doit être dupliquée ailleurs (contrôleurs, autres
// services). Toute transition non prévue par TRANSITIONS_AUTORISEES lève
// une exception explicite et typée ; elle n'échoue jamais silencieusement
// et n'est jamais seulement empêchée côté UI.
@Injectable()
export class TransactionStateMachineService {
  assertTransitionAutorisee(
    depuis: StatutTransaction,
    vers: StatutTransaction,
  ): void {
    const transitionsPermises = TRANSITIONS_AUTORISEES[depuis] ?? [];

    if (!transitionsPermises.includes(vers)) {
      throw new BadRequestException(
        `Transition "${depuis}" -> "${vers}" non autorisée pour une TransactionCaisse (cahier des charges §6.4).`,
      );
    }
  }

  transitionsPermises(depuis: StatutTransaction): StatutTransaction[] {
    return TRANSITIONS_AUTORISEES[depuis] ?? [];
  }
}
