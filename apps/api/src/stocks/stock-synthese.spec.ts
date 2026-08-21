import {
  deficitStock,
  median,
  statutQuant,
  surplusStock,
  worstStatut,
} from './stock-synthese';

describe('stock-synthese helpers', () => {
  describe('statutQuant', () => {
    it('signale une rupture à 0', () => {
      expect(statutQuant(0, 5)).toBe('RUPTURE');
    });
    it('signale le sous-seuil', () => {
      expect(statutQuant(3, 5)).toBe('SOUS_SEUIL');
    });
    it('reste OK sans seuil défini', () => {
      expect(statutQuant(1, null)).toBe('OK');
    });
  });

  describe('deficitStock / surplusStock', () => {
    it('demande le seuil en rupture', () => {
      expect(deficitStock(0, 5)).toBe(5);
    });
    it('demande 1 unité en rupture sans seuil', () => {
      expect(deficitStock(0, null)).toBe(1);
    });
    it('ne descend pas la source sous le seuil', () => {
      expect(surplusStock(20, 5)).toBe(15);
    });
    it('conserve 1 unité sans seuil', () => {
      expect(surplusStock(10, null)).toBe(9);
    });
  });

  describe('worstStatut / median', () => {
    it('agrège le pire statut', () => {
      expect(worstStatut('OK', 'SOUS_SEUIL')).toBe('SOUS_SEUIL');
      expect(worstStatut('SOUS_SEUIL', 'RUPTURE')).toBe('RUPTURE');
    });
    it('calcule la médiane arrondie', () => {
      expect(median([])).toBeNull();
      expect(median([20])).toBe(20);
      expect(median([10, 20])).toBe(15);
    });
  });
});
