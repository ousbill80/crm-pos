import { BadRequestException } from '@nestjs/common';
import ExcelJS from 'exceljs';
import { parseCsvTable } from '../common/csv.util';

export async function tableDepuisFichier(input: {
  csv?: string;
  fichierBase64?: string;
  nomFichier?: string;
  enTetes?: string[];
  lignes?: string[][];
}): Promise<{ enTetes: string[]; lignes: string[][]; source: string }> {
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
      return { ...(await tableDepuisXlsx(buf)), source: 'xlsx' };
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

async function tableDepuisXlsx(buf: Buffer): Promise<{
  enTetes: string[];
  lignes: string[][];
}> {
  const wb = new ExcelJS.Workbook();
  // .xls binaire n’est pas supporté par ExcelJS — .xlsx uniquement.
  try {
    await wb.xlsx.load(buf as never);
  } catch {
    throw new BadRequestException(
      'Fichier Excel illisible. Exportez en .xlsx (Excel 2007+) ou en CSV.',
    );
  }
  const sheet = wb.worksheets[0];
  if (!sheet) {
    throw new BadRequestException(
      'Le classeur Excel ne contient aucune feuille.',
    );
  }
  const matrix: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    const values = (row.values as Array<unknown>).slice(1).map(cellToString);
    if (values.every((v) => v === '')) return;
    matrix.push(values);
  });
  const enTetes = (matrix.shift() ?? []).map((h) => h.trim());
  if (enTetes.length === 0) {
    throw new BadRequestException(
      'La première feuille Excel n’a pas d’en-tête.',
    );
  }
  const largeur = enTetes.length;
  const lignes = matrix.map((r) => {
    const padded = r.slice(0, largeur);
    while (padded.length < largeur) padded.push('');
    return padded.map((c) => c.trim());
  });
  return { enTetes, lignes };
}

function cellToString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return String(value);
  }
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object' && value !== null && 'text' in value) {
    return String(value.text);
  }
  if (typeof value === 'object' && value !== null && 'result' in value) {
    return cellToString(value.result);
  }
  return String(value);
}
