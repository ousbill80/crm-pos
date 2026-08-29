import { describe, expect, it } from 'vitest';
import { StatutSessionCaisse } from '@caisse-crm/shared';
import { derniereSessionFermee, indexEtapeCircuitFonds, montantPointJournee } from './pos-journee-fermee';
import type { SessionCaisseDto } from './types';

function session(
  partial: Partial<SessionCaisseDto> & Pick<SessionCaisseDto, 'id' | 'caisseId' | 'statut'>,
): SessionCaisseDto {
  return {
    ouvertureDateHeure: '2026-08-29T08:00:00.000Z',
    fondInitial: '5000',
    ouvertureUtilisateurId: 'u1',
    ouvertureTemoinId: 'u2',
    clotureDateHeure: null,
    fondCompteCloture: null,
    clotureUtilisateurId: null,
    clotureTemoinId: null,
    transactionVersementId: null,
    ...partial,
  };
}

describe('derniereSessionFermee', () => {
  it('ignore les sessions encore ouvertes et un autre tiroir', () => {
    const rows = [
      session({
        id: 'ouverte',
        caisseId: 't1',
        statut: StatutSessionCaisse.OUVERTE,
      }),
      session({
        id: 'autre',
        caisseId: 't2',
        statut: StatutSessionCaisse.FERMEE,
        clotureDateHeure: '2026-08-29T20:00:00.000Z',
      }),
    ];
    expect(derniereSessionFermee(rows, 't1')).toBeUndefined();
  });

  it('prend la clôture la plus récente du tiroir', () => {
    const rows = [
      session({
        id: 'hier',
        caisseId: 't1',
        statut: StatutSessionCaisse.FERMEE,
        clotureDateHeure: '2026-08-28T20:00:00.000Z',
      }),
      session({
        id: 'soir',
        caisseId: 't1',
        statut: StatutSessionCaisse.FERMEE,
        clotureDateHeure: '2026-08-29T21:10:00.000Z',
      }),
    ];
    expect(derniereSessionFermee(rows, 't1')?.id).toBe('soir');
  });

  it('calcule le point du jour = fond compté − fond initial', () => {
    expect(
      montantPointJournee({ fondInitial: '5000', fondCompteCloture: '7000' }),
    ).toBe(2000);
    expect(
      montantPointJournee({ fondInitial: '5000', fondCompteCloture: '4000' }),
    ).toBe(0);
  });
});

describe('indexEtapeCircuitFonds', () => {
  it('place l’étape courante selon le statut §6.4', () => {
    expect(indexEtapeCircuitFonds(null)).toBe(-1);
    expect(indexEtapeCircuitFonds('INITIEE')).toBe(0);
    expect(indexEtapeCircuitFonds('EN_TRANSIT')).toBe(1);
    expect(indexEtapeCircuitFonds('RECEPTIONNEE')).toBe(2);
    expect(indexEtapeCircuitFonds('VALIDEE')).toBe(3);
  });
});
