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
