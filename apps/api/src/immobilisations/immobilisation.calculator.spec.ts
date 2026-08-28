import { Prisma } from '@prisma/client';
import { monthlyDepreciation } from './immobilisation.calculator';

describe('monthlyDepreciation (linéaire, mois civil, XOF 2 décimales)', () => {
  it('splits 1000 over 3 months with last-month rounding', () => {
    const m1 = monthlyDepreciation({
      valeurBrute: 1000,
      dureeMois: 3,
    });
    expect(m1?.toFixed(2)).toBe('333.33');
    const m2 = monthlyDepreciation({
      valeurBrute: 1000,
      dureeMois: 3,
      cumulDejaDote: m1!,
      nombreDotationsDeja: 1,
    });
    expect(m2?.toFixed(2)).toBe('333.33');
    const m3 = monthlyDepreciation({
      valeurBrute: 1000,
      dureeMois: 3,
      cumulDejaDote: m1!.plus(m2!),
      nombreDotationsDeja: 2,
    });
    expect(m3?.toFixed(2)).toBe('333.34');
    expect(m1!.plus(m2!).plus(m3!).toFixed(2)).toBe('1000.00');
  });

  it('stops after the planned duration', () => {
    expect(
      monthlyDepreciation({
        valeurBrute: 1200,
        dureeMois: 12,
        cumulDejaDote: 1200,
        nombreDotationsDeja: 12,
      }),
    ).toBeNull();
  });

  it('uses residual value and exact 12-month lots', () => {
    const amount = monthlyDepreciation({
      valeurBrute: 1000,
      valeurResiduelle: 100,
      dureeMois: 12,
    });
    expect(amount?.toFixed(2)).toBe('75.00');
  });

  it('rejects a residual above the gross amount', () => {
    expect(
      monthlyDepreciation({
        valeurBrute: 100,
        valeurResiduelle: 100,
        dureeMois: 12,
      }),
    ).toBeNull();
  });

  it('never exceeds the remaining amortizable amount', () => {
    const last = monthlyDepreciation({
      valeurBrute: new Prisma.Decimal('100.00'),
      dureeMois: 3,
      cumulDejaDote: '66.67',
      nombreDotationsDeja: 2,
    });
    expect(last?.toFixed(2)).toBe('33.33');
  });
});
