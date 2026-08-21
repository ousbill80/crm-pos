// Utilitaire CSV pur (échappement RFC 4180 : guillemets, virgules, retours à
// la ligne) — réutilisé par les exports CRM (campagnes) et Reporting.
export type CsvPrimitive = string | number | boolean | Date | null | undefined;

export interface CsvColumn<T> {
  key: keyof T;
  header: string;
}

export function toCsv<T extends Record<string, CsvPrimitive>>(
  rows: T[],
  columns: CsvColumn<T>[],
): string {
  const escape = (value: CsvPrimitive): string => {
    const str =
      value === null || value === undefined
        ? ''
        : value instanceof Date
          ? value.toISOString()
          : String(value);
    return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };

  const header = columns.map((c) => escape(c.header)).join(',');
  const lines = rows.map((row) =>
    columns.map((c) => escape(row[c.key])).join(','),
  );
  return [header, ...lines].join('\r\n');
}

/** Table délimitée (CSV / TSV) — BOM, quotes RFC 4180, séparateur auto. */
export function parseCsvTable(contenu: string): {
  enTetes: string[];
  lignes: string[][];
} {
  const text = contenu
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  if (!text.trim()) return { enTetes: [], lignes: [] };

  const firstLine = text.split('\n').find((l) => l.trim().length > 0) ?? '';
  const counts = {
    ';': (firstLine.match(/;/g) ?? []).length,
    ',': (firstLine.match(/,/g) ?? []).length,
    '\t': (firstLine.match(/\t/g) ?? []).length,
  };
  const separateur =
    counts[';'] >= counts[','] && counts[';'] >= counts['\t']
      ? ';'
      : counts['\t'] > counts[',']
        ? '\t'
        : ',';

  const rows: string[][] = [];
  let current = '';
  let inQuotes = false;
  const row: string[] = [];

  const pushCell = () => {
    row.push(current);
    current = '';
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === '' && rows.length === 0) {
      row.length = 0;
      return;
    }
    if (row.every((c) => c.trim() === '')) {
      row.length = 0;
      return;
    }
    rows.push([...row]);
    row.length = 0;
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === separateur) {
      pushCell();
      continue;
    }
    if (ch === '\n') {
      pushCell();
      pushRow();
      continue;
    }
    current += ch;
  }
  if (current.length > 0 || row.length > 0) {
    pushCell();
    pushRow();
  }

  const enTetes = (rows.shift() ?? []).map((h) => h.trim());
  const largeur = enTetes.length;
  const lignes = rows.map((r) => {
    const padded = r.slice(0, largeur);
    while (padded.length < largeur) padded.push('');
    return padded.map((c) => c.trim());
  });
  return { enTetes, lignes };
}
