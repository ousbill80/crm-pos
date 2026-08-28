import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class InvoiceMatchStateMachine {
  assertCanExcept(role: string, reason: string): void {
    if (role !== 'DAF' && role !== 'DIRECTION_GENERALE') {
      throw new ForbiddenException(
        'Seuls la DAF ou la Direction Générale peuvent accorder une exception de rapprochement.',
      );
    }
    if (reason.trim().length < 10) {
      throw new BadRequestException(
        'Une exception exige un motif explicite d’au moins 10 caractères.',
      );
    }
  }

  assertCanPost(
    matchStatus: string,
    hasValidException: boolean,
    role: string,
  ): void {
    if (role !== 'RAF_COMPTABLE') {
      throw new ForbiddenException(
        'Seul le RAF/Comptable peut comptabiliser une facture rapprochée.',
      );
    }
    if (matchStatus !== 'RAPPROCHEE' && !hasValidException) {
      throw new BadRequestException(
        'Facture bloquée : le rapprochement doit être conforme ou couvert par une exception DAF/DG auditée.',
      );
    }
  }

  assertCanCredit(status: string): void {
    if (status === 'PAYEE') {
      throw new BadRequestException(
        'Une facture payée ne peut pas être compensée par ce parcours.',
      );
    }
  }
}
