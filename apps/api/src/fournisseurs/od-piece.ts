import { BadRequestException } from '@nestjs/common';

const PIECE_OD_MIN = 3;
const PIECE_OD_MAX = 40;

/**
 * SYSCOHADA / Acte uniforme OHADA : toute écriture repose sur une pièce
 * justificative identifiée (facture, ticket, relevé, ou pièce interne pour une OD).
 * Une OD n’est pas une écriture « libre » : la référence de pièce est obligatoire.
 */
export function referencePieceOd(raw: string | undefined): string {
  const piece = raw?.trim() ?? '';
  if (piece.length < PIECE_OD_MIN || piece.length > PIECE_OD_MAX) {
    throw new BadRequestException(
      'Une opération diverse exige une référence de pièce justificative (note interne, PV, décision). SYSCOHADA : pas d’écriture sans pièce.',
    );
  }
  return piece;
}

export function libelleOdAvecPiece(
  referencePiece: string,
  libelle: string,
): string {
  const piece = referencePieceOd(referencePiece);
  const objet = libelle.trim();
  if (!objet) {
    throw new BadRequestException('Le libellé de l’OD est obligatoire.');
  }
  if (
    objet === piece ||
    objet.startsWith(`${piece} — `) ||
    objet.startsWith(`${piece} - `)
  ) {
    return objet;
  }
  return `${piece} — ${objet}`;
}
