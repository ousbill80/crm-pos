import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parseCsvTable } from '../common/csv.util';
import { detecterLigneEntetes, scoreMapping } from './produits-import.mapper';

export interface FeuilleImport {
  nom: string;
  lignes: number;
  score: number;
}

export async function tableDepuisFichier(input: {
  csv?: string;
  fichierBase64?: string;
  nomFichier?: string;
  nomFeuille?: string;
  enTetes?: string[];
  lignes?: string[][];
}): Promise<{
  enTetes: string[];
  lignes: string[][];
  source: string;
  feuille?: string;
  feuilles?: FeuilleImport[];
}> {
  if (input.enTetes && input.lignes) {
    return { enTetes: input.enTetes, lignes: input.lignes, source: 'table' };
  }

  const nom = (input.nomFichier ?? '').toLowerCase();
  if (input.fichierBase64) {
    const buf = Buffer.from(
      input.fichierBase64.replace(/^data:.*?;base64,/, ''),
      'base64',
    );
    if (nom.endsWith('.xlsx') || nom.endsWith('.xls') || looksLikeZip(buf)) {
      return {
        ...(await tableDepuisXlsx(buf, input.nomFeuille)),
        source: 'xlsx',
      };
    }
    return { ...parseCsvTable(buf.toString('utf8')), source: 'csv' };
  }

  if (input.csv) {
    if (nom.endsWith('.xlsx') || nom.endsWith('.xls')) {
      throw new BadRequestException(
        'Fichier Excel : envoyez le binaire en fichierBase64, pas le texte CSV.',
      );
    }
    return { ...parseCsvTable(input.csv), source: 'csv' };
  }

  throw new BadRequestException(
    'Aucune table à importer : csv, fichier Excel (base64) ou en-têtes + lignes.',
  );
}

function looksLikeZip(buf: Buffer): boolean {
  return buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}

async function tableDepuisXlsx(
  buf: Buffer,
  nomFeuille?: string,
): Promise<{
  enTetes: string[];
  lignes: string[][];
  feuille: string;
  feuilles: FeuilleImport[];
}> {
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as never);
  } catch {
    throw new BadRequestException(
      'Fichier Excel illisible. Exportez en .xlsx (Excel 2007+) ou en CSV.',
    );
  }
  if (wb.worksheets.length === 0) {
    throw new BadRequestException(
      'Le classeur Excel ne contient aucune feuille.',
    );
  }

  const candidates = wb.worksheets.map((sheet) => {
    const matrix = matrixDepuisFeuille(sheet);
    const idxEntetes = detecterLigneEntetes(matrix);
    const enTetes = (matrix[idxEntetes] ?? []).map((h) => h.trim());
    const lignes = matrix.slice(idxEntetes + 1);
    return {
      nom: sheet.name,
      enTetes,
      lignes: normaliserLargeur(enTetes, lignes),
      score: scoreMapping(enTetes),
    };
  });

  const feuilles: FeuilleImport[] = candidates.map((c) => ({
    nom: c.nom,
    lignes: c.lignes.length,
    score: c.score,
  }));

  const choisie =
    (nomFeuille
      ? candidates.find((c) => c.nom.toLowerCase() === nomFeuille.toLowerCase())
      : null) ??
    [...candidates].sort(
      (a, b) => b.score - a.score || b.lignes.length - a.lignes.length,
    )[0];

  if (!choisie || choisie.enTetes.length === 0) {
    throw new BadRequestException(
      'Impossible de trouver une ligne d’en-têtes dans le classeur Excel.',
    );
  }

  return {
    enTetes: choisie.enTetes,
    lignes: choisie.lignes,
    feuille: choisie.nom,
    feuilles,
  };
}

function matrixDepuisFeuille(sheet: ExcelJS.Worksheet): string[][] {
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as Array<unknown>).slice(1).map(cellToString);
    if (values.every((v) => v === '')) return;
    matrix.push(values);
  });
  return matrix;
}

function normaliserLargeur(enTetes: string[], lignes: string[][]): string[][] {
  const largeur = enTetes.length;
  return lignes.map((r) => {
    const padded = r.slice(0, largeur);
    while (padded.length < largeur) padded.push('');
    return padded.map((c) => c.trim());
  });
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (Number.isInteger(value) || Math.abs(value) >= 1e10) {
      return String(Math.round(value));
    }
    return String(value);
  }
  if (typeof value === 'string' || typeof value === 'boolean') {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String(value.text);
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return cellToString(value.result);
  }
  return '';
}
