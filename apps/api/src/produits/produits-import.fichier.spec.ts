import ExcelJS from 'exceljs';
import { tableDepuisFichier } from './produits-import.fichier';
import { proposerMapping } from './produits-import.mapper';

describe('import catalogue — Excel .xlsx', () => {
  it('lit la première feuille et mappe SKU / Name / Price', async () => {
    const wb = new ExcelJS.Workbook();
    const sheet = wb.addWorksheet('Catalogue');
    sheet.addRow(['SKU', 'Name', 'Price']);
    sheet.addRow(['XL-01', 'Coque Excel', 4200]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const table = await tableDepuisFichier({
      fichierBase64: buf.toString('base64'),
      nomFichier: 'catalogue.xlsx',
    });
    expect(table.source).toBe('xlsx');
    expect(table.enTetes).toEqual(['SKU', 'Name', 'Price']);
    expect(table.lignes[0]).toEqual(['XL-01', 'Coque Excel', '4200']);
    const mapping = proposerMapping(table.enTetes);
    expect(mapping.reference).toBe('SKU');
    expect(mapping.designation).toBe('Name');
    expect(mapping.prixUnitaire).toBe('Price');
  });
});
