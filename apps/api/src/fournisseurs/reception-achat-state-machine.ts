import { BadRequestException, Injectable } from '@nestjs/common';
import {
  StatutReceptionAchat,
  TRANSITIONS_RECEPTION_ACHAT,
} from '@caisse-crm/shared';

@Injectable()
export class ReceptionAchatStateMachine {
  assertTransition(
    depuis: StatutReceptionAchat,
    vers: StatutReceptionAchat,
  ): void {
    if (!TRANSITIONS_RECEPTION_ACHAT[depuis]?.includes(vers)) {
      throw new BadRequestException(
        `Transition réception achat "${depuis}" → "${vers}" non autorisée.`,
      );
    }
  }
}
