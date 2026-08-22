import { pointsFideliteDepuisMontant } from '../crm-thresholds.constants';

describe('pointsFideliteDepuisMontant', () => {
  it('1 pt / 1000 FCFA avec floor', () => {
    expect(pointsFideliteDepuisMontant(0)).toBe(0);
    expect(pointsFideliteDepuisMontant(999)).toBe(0);
    expect(pointsFideliteDepuisMontant(1000)).toBe(1);
    expect(pointsFideliteDepuisMontant(1999)).toBe(1);
    expect(pointsFideliteDepuisMontant(2500)).toBe(2);
    expect(pointsFideliteDepuisMontant('11980')).toBe(11);
  });
});
