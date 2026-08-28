import {
  fmtFcfaPdf,
  latiniserTextePdf,
  dessinerLogoEnseigne,
} from './pdf.util';
import PDFDocument from 'pdfkit';

describe('fmtFcfaPdf — séparateur de milliers Helvetica-safe', () => {
  it('écrit 2000 en « 2 000 FCFA » sans slash (U+202F → / en WinAnsi)', () => {
    const texte = fmtFcfaPdf(2000);
    expect(texte).toBe('2 000 FCFA');
    expect(texte).not.toMatch(/\//);
    expect(texte).not.toMatch(/[\u00a0\u202f]/);
  });

  it('conserve les milliers pour 2500 et 3000', () => {
    expect(fmtFcfaPdf(2500)).toBe('2 500 FCFA');
    expect(fmtFcfaPdf('3000.40')).toBe('3 000 FCFA');
  });

  it('latiniserTextePdf remplace l’espace fine par un espace ASCII', () => {
    expect(latiniserTextePdf('2\u202f000')).toBe('2 000');
  });
});

describe('dessinerLogoEnseigne — MAJOR AUTO PARTS', () => {
  it('écrit MAJOR et AUTO PARTS dans le PDF', async () => {
    const buf = await new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 48, size: 'A4', compress: false });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      dessinerLogoEnseigne(doc, { y: 20 });
      doc.end();
    });
    const raw = buf.toString('latin1');
    // PDFKit encode WinAnsi en hex (`<4d414a4f52>` = MAJOR).
    expect(raw).toContain('4d414a4f52');
    expect(raw).toMatch(/<41>\s+\d+\s+<5554>/);
  });
});
