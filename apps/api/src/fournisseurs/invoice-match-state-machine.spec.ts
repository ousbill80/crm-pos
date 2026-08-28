import { BadRequestException } from '@nestjs/common';
import { InvoiceMatchStateMachine } from './invoice-match-state-machine';

describe('InvoiceMatchStateMachine', () => {
  const machine = new InvoiceMatchStateMachine();

  it('autorise le RAF à comptabiliser une facture conforme', () => {
    expect(() =>
      machine.assertCanPost('RAPPROCHEE', false, 'RAF_COMPTABLE'),
    ).not.toThrow();
  });

  it('autorise le RAF après une exception explicite valide', () => {
    expect(() =>
      machine.assertCanPost('LITIGE', true, 'RAF_COMPTABLE'),
    ).not.toThrow();
  });

  it('bloque une facture litigieuse sans exception', () => {
    expect(() =>
      machine.assertCanPost('LITIGE', false, 'RAF_COMPTABLE'),
    ).toThrow(BadRequestException);
  });

  it.each(['RAF_COMPTABLE', 'ACHATS', 'RESPONSABLE_SI'])(
    'interdit une exception au rôle %s',
    (role) => {
      expect(() => machine.assertCanExcept(role, 'motif documenté')).toThrow();
    },
  );

  it.each(['DAF', 'DIRECTION_GENERALE'])(
    'autorise une exception motivée au rôle %s',
    (role) => {
      expect(() =>
        machine.assertCanExcept(role, 'écart accepté après revue'),
      ).not.toThrow();
    },
  );

  it('refuse une exception sans motif', () => {
    expect(() => machine.assertCanExcept('DAF', '  ')).toThrow(
      BadRequestException,
    );
  });
});
