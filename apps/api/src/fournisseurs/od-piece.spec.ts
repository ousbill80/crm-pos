import { BadRequestException } from '@nestjs/common';
import { libelleOdAvecPiece, referencePieceOd } from './od-piece';

describe('pièce justificative OD (SYSCOHADA)', () => {
  it('refuse une OD sans référence de pièce', () => {
    expect(() => referencePieceOd('')).toThrow(BadRequestException);
    expect(() => referencePieceOd('  ')).toThrow(BadRequestException);
    expect(() => referencePieceOd('AB')).toThrow(BadRequestException);
    expect(() => referencePieceOd(undefined)).toThrow(BadRequestException);
  });

  it('accepte une pièce interne numérotée et la préfixe au libellé', () => {
    expect(referencePieceOd(' NI-2026-014 ')).toBe('NI-2026-014');
    expect(libelleOdAvecPiece('OD-2026-0042', 'Reclassement 6xx / 7xx')).toBe(
      'OD-2026-0042 — Reclassement 6xx / 7xx',
    );
  });

  it('ne duplique pas la référence si le libellé la contient déjà', () => {
    expect(libelleOdAvecPiece('OD-1', 'OD-1 — Regularisation')).toBe(
      'OD-1 — Regularisation',
    );
  });
});
