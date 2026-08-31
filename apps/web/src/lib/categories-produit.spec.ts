import { describe, expect, it } from 'vitest';
import { fusionnerCategoriesProduit } from './categories-produit';

describe('fusionnerCategoriesProduit', () => {
  it('inclut le référentiel, l’API et la valeur courante', () => {
    const result = fusionnerCategoriesProduit(['Freinage', 'Phares'], 'Freinage');
    expect(result).toContain('Freinage');
    expect(result).toContain('Phares');
    expect(result).toContain('Mécanique');
    expect(result).toContain('Protection');
  });

  it('trie en français sans doublons', () => {
    const result = fusionnerCategoriesProduit(['Mécanique'], 'Mécanique');
    expect(result.filter((c) => c === 'Mécanique')).toHaveLength(1);
    expect(result.indexOf('Accessoires')).toBeLessThan(result.indexOf('Mécanique'));
  });
});
