-- Journal des ventes (structure SYSCOHADA). Les ventes POS restent sur
-- le grand livre caisse tant que la TVA vente n'est pas paramétrée.
ALTER TYPE "TypeJournalComptable" ADD VALUE 'VENTES';
