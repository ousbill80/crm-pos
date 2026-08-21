import { parseCsvTable } from '../common/csv.util';
import {
  parserLigneCatalogue,
  proposerMapping,
  parseNombre,
  parseBooleen,
} from './produits-import.mapper';

describe('import catalogue — mapping dynamique', () => {
  it('reconnaît les en-têtes de l’export interne (Référence, Désignation…)', () => {
    const mapping = proposerMapping([
      'Référence',
      'Désignation',
      'Catégorie',
      'Actif',
      'Prix unitaire',
      'CMP',
      'Marge unitaire',
      'Stock réseau',
      'Seuil réappro',
    ]);
    expect(mapping.reference).toBe('Référence');
    expect(mapping.designation).toBe('Désignation');
    expect(mapping.prixUnitaire).toBe('Prix unitaire');
    expect(mapping.stock).toBe('Stock réseau');
    expect(mapping.seuilReappro).toBe('Seuil réappro');
    expect(mapping.categorie).toBe('Catégorie');
  });

  it('reconnaît des en-têtes fournisseur longs (Code article, Prix de vente TTC)', () => {
    const mapping = proposerMapping([
      'Code article',
      'Libellé produit',
      'Prix de vente TTC',
      'Notes internes',
    ]);
    expect(mapping.reference).toBe('Code article');
    expect(mapping.designation).toBe('Libellé produit');
    expect(mapping.prixUnitaire).toBe('Prix de vente TTC');
  });

  it('reconnaît un export fournisseur anglais (SKU / Name / Price)', () => {
    const mapping = proposerMapping([
      'SKU',
      'Name',
      'Price',
      'Barcode',
      'Category',
    ]);
    expect(mapping.reference).toBe('SKU');
    expect(mapping.designation).toBe('Name');
    expect(mapping.prixUnitaire).toBe('Price');
    expect(mapping.codeBarres).toBe('Barcode');
    expect(mapping.categorie).toBe('Category');
  });

  it('ignore CMP / marge / statut — indicateurs calculés, pas importables', () => {
    const mapping = proposerMapping([
      'Nom',
      'CMP',
      'Marge',
      'Statut stock',
      'Valeur stock',
    ]);
    expect(mapping.designation).toBe('Nom');
    expect(mapping.prixUnitaire).toBeUndefined();
  });

  it('parse un CSV français (point-virgule, décimale à virgule, BOM)', () => {
    const csv = '\uFEFFSKU;Nom;PV\nCBL-01;"Câble USB, 1m";2 500,50\n';
    const table = parseCsvTable(csv);
    expect(table.enTetes).toEqual(['SKU', 'Nom', 'PV']);
    expect(table.lignes[0]).toEqual(['CBL-01', 'Câble USB, 1m', '2 500,50']);
    expect(parseNombre('2 500,50')).toBe(2500.5);
  });

  it('parse oui/non et true/false pour le statut actif', () => {
    expect(parseBooleen('Oui')).toBe(true);
    expect(parseBooleen('inactif')).toBe(false);
    expect(parseBooleen('TRUE')).toBe(true);
  });

  it('exige un prix positif à la création (ligne sans identifiant existant)', () => {
    const mapping = proposerMapping(['Désignation', 'Prix']);
    const parsed = parserLigneCatalogue(
      ['Désignation', 'Prix'],
      ['Coque', '0'],
      mapping,
      2,
    );
    expect(parsed.erreurs.some((e) => e.includes('Prix'))).toBe(true);
  });
});
