export type ParsedBankStatementLine = {
  numeroLigne: number;
  dateOperation: string;
  libelle: string;
  reference?: string;
  montant: number;
  devise: string;
};

const HEADER_DATE = /^(date|date.?op[eé]ration|date.?valeur)$/i;
const HEADER_LIBELLE = /^(libell[eé]|description|intitul[eé]|memo)$/i;
const HEADER_MONTANT = /^(montant|amount|somme)$/i;
const HEADER_DEBIT = /^(d[eé]bit|debit)$/i;
const HEADER_CREDIT = /^(cr[eé]dit|credit)$/i;
const HEADER_REF = /^(r[eé]f[eé]rence|ref|reference)$/i;

function detectDelimiter(firstLine: string): ',' | ';' | '\t' {
  const semi = (firstLine.match(/;/g) ?? []).length;
  const tab = (firstLine.match(/\t/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  if (tab > 0 && tab >= semi && tab >= comma) return '\t';
  if (semi >= comma) return ';';
  return ',';
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === delimiter) {
      cells.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

export function parseDateOperation(raw: string): string {
  const value = raw.trim();
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const fr = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (fr) {
    return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  }
  throw new Error(`Date d’opération illisible : ${raw}`);
}

export function parseMontantCsv(raw: string): number {
  const normalized = raw
    .trim()
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
  if (
    !normalized ||
    normalized === '-' ||
    normalized === '.' ||
    normalized === ','
  ) {
    throw new Error(`Montant illisible : ${raw}`);
  }
  const hasComma = normalized.includes(',');
  const hasDot = normalized.includes('.');
  let numeric = normalized;
  if (hasComma && hasDot) {
    numeric =
      normalized.lastIndexOf(',') > normalized.lastIndexOf('.')
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
  } else if (hasComma) {
    numeric = normalized.replace(',', '.');
  }
  const amount = Number(numeric);
  if (!Number.isFinite(amount)) {
    throw new Error(`Montant illisible : ${raw}`);
  }
  return amount;
}

function looksLikeHeader(cells: string[]): boolean {
  return cells.some(
    (cell) =>
      HEADER_DATE.test(cell) ||
      HEADER_LIBELLE.test(cell) ||
      HEADER_MONTANT.test(cell) ||
      HEADER_DEBIT.test(cell) ||
      HEADER_CREDIT.test(cell),
  );
}

function columnIndex(headers: string[], test: RegExp): number {
  return headers.findIndex((header) => test.test(header));
}

export function parseBankStatementCsv(
  text: string,
  devise = 'XOF',
): ParsedBankStatementLine[] {
  const source = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n');
  const rawLines = source.split('\n').filter((line) => line.trim().length > 0);
  if (rawLines.length === 0) {
    throw new Error('Le fichier CSV est vide.');
  }
  const delimiter = detectDelimiter(rawLines[0]);
  const rows = rawLines.map((line) => splitCsvLine(line, delimiter));
  let start = 0;
  let dateIdx = 0;
  let libelleIdx = 1;
  let montantIdx = 2;
  let debitIdx = -1;
  let creditIdx = -1;
  let refIdx = -1;
  if (looksLikeHeader(rows[0])) {
    const headers = rows[0].map((cell) => cell.replace(/"/g, ''));
    dateIdx = columnIndex(headers, HEADER_DATE);
    libelleIdx = columnIndex(headers, HEADER_LIBELLE);
    montantIdx = columnIndex(headers, HEADER_MONTANT);
    debitIdx = columnIndex(headers, HEADER_DEBIT);
    creditIdx = columnIndex(headers, HEADER_CREDIT);
    refIdx = columnIndex(headers, HEADER_REF);
    if (
      dateIdx < 0 ||
      libelleIdx < 0 ||
      (montantIdx < 0 && debitIdx < 0 && creditIdx < 0)
    ) {
      throw new Error(
        'En-tête CSV incomplet : il faut une date, un libellé et un montant (ou débit/crédit).',
      );
    }
    start = 1;
  }
  const lignes: ParsedBankStatementLine[] = [];
  for (let i = start; i < rows.length; i += 1) {
    const cells = rows[i];
    if (cells.every((cell) => cell === '')) continue;
    const dateOperation = parseDateOperation(cells[dateIdx] ?? '');
    const libelle = (cells[libelleIdx] ?? '').trim();
    if (!libelle) {
      throw new Error(`Libellé manquant à la ligne ${i + 1}.`);
    }
    let montant: number;
    if (montantIdx >= 0 && (cells[montantIdx] ?? '').trim() !== '') {
      montant = parseMontantCsv(cells[montantIdx]);
    } else {
      const debitRaw = debitIdx >= 0 ? (cells[debitIdx] ?? '').trim() : '';
      const creditRaw = creditIdx >= 0 ? (cells[creditIdx] ?? '').trim() : '';
      const debit = debitRaw ? parseMontantCsv(debitRaw) : 0;
      const credit = creditRaw ? parseMontantCsv(creditRaw) : 0;
      montant = credit - debit;
    }
    if (montant === 0) {
      throw new Error(`Montant nul à la ligne ${i + 1}.`);
    }
    const reference = refIdx >= 0 ? (cells[refIdx] ?? '').trim() : '';
    lignes.push({
      numeroLigne: lignes.length + 1,
      dateOperation,
      libelle: libelle.slice(0, 240),
      ...(reference ? { reference: reference.slice(0, 120) } : {}),
      montant,
      devise,
    });
  }
  if (lignes.length === 0) {
    throw new Error('Aucune ligne d’opération dans le relevé CSV.');
  }
  return lignes;
}
