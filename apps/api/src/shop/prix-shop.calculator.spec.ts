jest.mock('@caisse-crm/shared', () => {
  /* eslint-disable @typescript-eslint/no-require-imports -- factory jest.mock hoistée */
  const fs = require('node:fs') as typeof import('node:fs');
  const path = require('node:path') as typeof import('node:path');
  const ts = require('typescript') as typeof import('typescript');
  const { Module } = require('node:module') as typeof import('node:module');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const sourcePath = path.resolve(
    __dirname,
    '../../../../packages/shared/src/enums.ts',
  );
  const { outputText } = ts.transpileModule(
    fs.readFileSync(sourcePath, 'utf8'),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  );
  const mod = new Module(sourcePath) as InstanceType<typeof Module> & {
    _compile(content: string, filename: string): unknown;
  };
  mod.filename = sourcePath;
  mod._compile(outputText, sourcePath);
  return mod.exports as typeof import('@caisse-crm/shared');
});

import { ModeAffichagePrixShop } from '@caisse-crm/shared';
import {
  calculerLigneCommandeWeb,
  calculerTtc,
  resoudrePrixProduitShop,
} from './prix-shop.calculator';

describe('prix-shop.calculator', () => {
  const paramsHt = {
    modeAffichagePrix: ModeAffichagePrixShop.HT,
    tauxTvaDefaut: 18,
    fallbackPrixMagasin: true,
  };

  const paramsTtc = {
    ...paramsHt,
    modeAffichagePrix: ModeAffichagePrixShop.TTC,
  };

  it('exclut un produit non visible web', () => {
    expect(
      resoudrePrixProduitShop(
        {
          prixWeb: 1000,
          prixUnitaire: 800,
          visibleWeb: false,
          tauxTva: null,
          designation: 'Coque',
        },
        paramsHt,
      ),
    ).toBeNull();
  });

  it('utilise prixWeb en priorité', () => {
    const prix = resoudrePrixProduitShop(
      {
        prixWeb: 1200,
        prixUnitaire: 800,
        visibleWeb: true,
        tauxTva: null,
        designation: 'Coque',
      },
      paramsHt,
    );
    expect(prix?.prixUnitaireHt).toBe(1200);
    expect(prix?.prixAffiche).toBe(1200);
  });

  it('fallback prix magasin si prixWeb absent', () => {
    const prix = resoudrePrixProduitShop(
      {
        prixWeb: null,
        prixUnitaire: 900,
        visibleWeb: true,
        tauxTva: null,
        designation: 'Câble',
      },
      paramsHt,
    );
    expect(prix?.prixUnitaireHt).toBe(900);
  });

  it('masque si pas de prixWeb et fallback désactivé', () => {
    expect(
      resoudrePrixProduitShop(
        {
          prixWeb: null,
          prixUnitaire: 900,
          visibleWeb: true,
          tauxTva: null,
          designation: 'Câble',
        },
        { ...paramsHt, fallbackPrixMagasin: false },
      ),
    ).toBeNull();
  });

  it('affiche TTC quand configuré', () => {
    const prix = resoudrePrixProduitShop(
      {
        prixWeb: 1000,
        prixUnitaire: 1000,
        visibleWeb: true,
        tauxTva: 18,
        designation: 'Chargeur',
      },
      paramsTtc,
    );
    expect(prix?.prixAffiche).toBe(calculerTtc(1000, 18));
  });

  it('calcule une ligne commande avec TVA', () => {
    const prix = resoudrePrixProduitShop(
      {
        prixWeb: 1000,
        prixUnitaire: 1000,
        visibleWeb: true,
        tauxTva: 18,
        designation: 'Chargeur',
      },
      paramsHt,
    )!;
    const ligne = calculerLigneCommandeWeb(2, prix);
    expect(ligne.montantLigneTtc).toBe(calculerTtc(2000, 18));
    expect(ligne.montantTvaLigne).toBe(
      Math.round((ligne.montantLigneTtc - 2000) * 100) / 100,
    );
  });
});
