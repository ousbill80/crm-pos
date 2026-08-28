import { TypeJournalComptable } from '@prisma/client';

export const JOURNAUX_EXERCICE_DEFAUT: Array<{
  code: string;
  libelle: string;
  type: TypeJournalComptable;
}> = [
  {
    code: 'ACHATS',
    libelle: 'Journal des achats',
    type: TypeJournalComptable.ACHATS,
  },
  {
    code: 'BANQUE',
    libelle: 'Journal de banque',
    type: TypeJournalComptable.BANQUE,
  },
  {
    code: 'CAISSE',
    libelle: 'Journal de caisse',
    type: TypeJournalComptable.CAISSE,
  },
  {
    code: 'OD',
    libelle: 'Opérations diverses',
    type: TypeJournalComptable.OPERATIONS_DIVERSES,
  },
  {
    code: 'VENTES',
    libelle: 'Journal des ventes',
    type: TypeJournalComptable.VENTES,
  },
];

export function periodesMensuellesExercice(annee: number): Array<{
  code: string;
  dateDebut: Date;
  dateFin: Date;
}> {
  if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
    throw new Error('Année d’exercice invalide.');
  }
  return Array.from({ length: 12 }, (_, month) => ({
    code: `${annee}-${String(month + 1).padStart(2, '0')}`,
    dateDebut: new Date(Date.UTC(annee, month, 1)),
    dateFin: new Date(Date.UTC(annee, month + 1, 0, 23, 59, 59, 999)),
  }));
}
