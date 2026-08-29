import { describe, expect, it } from 'vitest';
import {
  appliquerTouchePistolet,
  etatPistoletVide,
  extraireQuantiteScan,
  PISTOLET_GAP_MS,
  produitContientRechercheCaisse,
  produitCorrespondAuCodeExact,
  resoudreScanCaisse,
  ressembleCodePistolet,
  trouverProduitParScan,
} from '@caisse-crm/shared';

const base = {
  actif: true,
  designation: 'Coque silicone',
  reference: 'COQ-001',
  codeBarres: '3760012345670',
};

const interne = {
  actif: true,
  designation: 'Joint spi',
  reference: 'JNT-001',
  codeBarres: 'INT000123456',
};

describe('pos-scan', () => {
  it('trouve l’article par code-barres EAN (scan pistolet)', () => {
    expect(trouverProduitParScan([base], '3760012345670')?.reference).toBe(
      'COQ-001',
    );
  });

  it('trouve l’article par référence SKU', () => {
    expect(trouverProduitParScan([base], 'COQ-001')?.codeBarres).toBe(
      '3760012345670',
    );
  });

  it('ignore la casse et les espaces', () => {
    expect(trouverProduitParScan([base], '  coq-001  ')?.designation).toBe(
      'Coque silicone',
    );
  });

  it('ne prend pas un produit inactif', () => {
    expect(
      trouverProduitParScan([{ ...base, actif: false }], '3760012345670'),
    ).toBeUndefined();
  });

  it('filtre la grille par fragment de code-barres', () => {
    expect(produitContientRechercheCaisse(base, '123456')).toBe(true);
    expect(produitContientRechercheCaisse(base, 'zzz')).toBe(false);
  });

  it('reconnaît un match exact code ou référence', () => {
    expect(produitCorrespondAuCodeExact(base, '3760012345670')).toBe(true);
    expect(produitCorrespondAuCodeExact(base, 'COQ-001')).toBe(true);
  });

  it('reconnaît le code interne INT imprimé sur l’étiquette', () => {
    expect(trouverProduitParScan([interne], 'INT000123456')?.reference).toBe(
      'JNT-001',
    );
    expect(trouverProduitParScan([interne], 'int000123456')?.reference).toBe(
      'JNT-001',
    );
  });

  it('rapporte UPC-A (12 chiffres) et EAN-13 avec zéro initial', () => {
    const upc = { ...base, codeBarres: '123456789012' };
    expect(trouverProduitParScan([upc], '0123456789012')?.reference).toBe(
      'COQ-001',
    );
    const eanZero = { ...base, codeBarres: '0123456789012' };
    expect(trouverProduitParScan([eanZero], '123456789012')?.reference).toBe(
      'COQ-001',
    );
  });

  it('ignore le préfixe AIM ]C1 d’un pistolet Code128', () => {
    expect(trouverProduitParScan([interne], ']C1INT000123456')?.reference).toBe(
      'JNT-001',
    );
  });

  it('accepte un EAN collé avec espaces', () => {
    expect(
      trouverProduitParScan([base], '3760 0123 4567 0')?.reference,
    ).toBe('COQ-001');
  });

  it('parse 3xSKU / 3×EAN', () => {
    expect(extraireQuantiteScan('3xCOQ-001')).toEqual({
      qte: 3,
      query: 'COQ-001',
    });
    expect(extraireQuantiteScan('2×3760012345670')).toEqual({
      qte: 2,
      query: '3760012345670',
    });
  });

  it('traite rupture et code inconnu sans fallback dangereux', () => {
    const stockOf = (p: typeof base) =>
      p.reference === 'COQ-001' ? 0 : 5;
    expect(
      resoudreScanCaisse([base], '3760012345670', 1, stockOf).statut,
    ).toBe('rupture');
    expect(
      resoudreScanCaisse([base], '0000000000000', 1, () => 10).statut,
    ).toBe('inconnu');
    expect(ressembleCodePistolet('3760012345670')).toBe(true);
    expect(ressembleCodePistolet('coq')).toBe(false);
  });

  it('n’ajoute pas un article unique par hasard sur un EAN inconnu', () => {
    const autre = {
      ...base,
      reference: 'AUTRE',
      designation: 'Huile 5W30',
      codeBarres: '9999999999999',
    };
    const r = resoudreScanCaisse(
      [base, autre],
      '1111111111111',
      1,
      () => 10,
    );
    expect(r.statut).toBe('inconnu');
  });

  it('accumule un pistolet rapide et ignore une saisie lente', () => {
    let etat = etatPistoletVide();
    let now = 1_000;
    for (const k of '3760012345670') {
      const r = appliquerTouchePistolet(etat, now, k);
      etat = r.etat;
      expect(r.code).toBeNull();
      now += 12;
    }
    const fin = appliquerTouchePistolet(etat, now, 'Enter');
    expect(fin.code).toBe('3760012345670');

    let lent = etatPistoletVide();
    lent = appliquerTouchePistolet(lent, 2_000, 'a').etat;
    lent = appliquerTouchePistolet(lent, 2_000 + PISTOLET_GAP_MS + 5, 'b')
      .etat;
    const enter = appliquerTouchePistolet(lent, 2_200, 'Enter');
    expect(enter.code).toBeNull();
  });
});
