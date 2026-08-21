import { BadRequestException, Injectable } from '@nestjs/common';
import { StatutBonStock, TRANSITIONS_BON_STOCK } from '@caisse-crm/shared';

@Injectable()
export class BonStockStateMachineService {
  assert(depuis: StatutBonStock, vers: StatutBonStock): void {
    const permises = TRANSITIONS_BON_STOCK[depuis] ?? [];
    if (!permises.includes(vers)) {
      throw new BadRequestException(
        `Transition bon de stock "${depuis}" → "${vers}" non autorisée.`,
      );
    }
  }
}
