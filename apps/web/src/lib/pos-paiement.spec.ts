import { describe, expect, it } from 'vitest';
import {
  ModePaiement,
  appliquerChiffreNumpad,
  completerPartMixte,
  monnaieARendre,
  partEspeces,
  syntheseEncaissement,
  toggleModePaiement,
  type PartPaiement,
} from '@caisse-crm/shared';

describe('encaissement mixte — reçu ≠ premier mode', () => {
  it('espèces 1000 + carte 1800, reçu 5000 → monnaie 4000 (pas 0, pas 2200)', () => {
    const parts: PartPaiement[] = [
      { mode: ModePaiement.ESPECES, montant: '1000' },
      { mode: ModePaiement.CARTE, montant: '1800' },
    ];
    const s = syntheseEncaissement({
      totalNet: 2800,
      parts,
      recuEspeces: 5000,
    });
    expect(s.repartitionOk).toBe(true);
    expect(s.cashPart).toBe(1000);
    expect(s.recu).toBe(5000);
    expect(s.monnaie).toBe(4000);
    expect(s.especesOk).toBe(true);
    expect(s.peutValider).toBe(true);
    expect(monnaieARendre(5000, 2800)).not.toBe(s.monnaie);
  });

  it('premier mode carte 1000 + espèces 1800 : cashPart = 1800, pas 1000', () => {
    const parts: PartPaiement[] = [
      { mode: ModePaiement.CARTE, montant: '1000' },
      { mode: ModePaiement.ESPECES, montant: '1800' },
    ];
    expect(partEspeces(parts)).toBe(1800);
    const vide = syntheseEncaissement({
      totalNet: 2800,
      parts,
      recuEspeces: 0,
    });
    expect(vide.cashPart).toBe(1800);
    expect(vide.especesOk).toBe(false);
    expect(vide.peutValider).toBe(false);

    const exact = syntheseEncaissement({
      totalNet: 2800,
      parts,
      recuEspeces: 1800,
    });
    expect(exact.monnaie).toBe(0);
    expect(exact.peutValider).toBe(true);

    const trop = syntheseEncaissement({
      totalNet: 2800,
      parts,
      recuEspeces: 5000,
    });
    expect(trop.monnaie).toBe(3200);
  });

  it('reçu vide ne copie jamais la part espèces', () => {
    const s = syntheseEncaissement({
      totalNet: 2800,
      parts: [
        { mode: ModePaiement.ESPECES, montant: '1000' },
        { mode: ModePaiement.CARTE, montant: '1800' },
      ],
      recuEspeces: 0,
    });
    expect(s.recu).toBe(0);
    expect(s.cashPart).toBe(1000);
    expect(s.especesOk).toBe(false);
  });

  it('sans espèces : pas de monnaie, reçu ignoré', () => {
    const s = syntheseEncaissement({
      totalNet: 2800,
      parts: [
        { mode: ModePaiement.CARTE, montant: '1000' },
        { mode: ModePaiement.MOBILE_MONEY, montant: '1800' },
      ],
      recuEspeces: 5000,
    });
    expect(s.aEspeces).toBe(false);
    expect(s.monnaie).toBe(0);
    expect(s.peutValider).toBe(true);
  });

  it('saisir la 1re part complète la 2e sans toucher le reçu', () => {
    const next = completerPartMixte(
      [
        { mode: ModePaiement.ESPECES, montant: '' },
        { mode: ModePaiement.CARTE, montant: '' },
      ],
      ModePaiement.ESPECES,
      '1000',
      2800,
    );
    expect(next).toEqual([
      { mode: ModePaiement.ESPECES, montant: '1000' },
      { mode: ModePaiement.CARTE, montant: '1800' },
    ]);
  });

  it('pavé : C vide, 0 initial remplacé', () => {
    expect(appliquerChiffreNumpad('1000', 'C')).toBe('');
    expect(appliquerChiffreNumpad('1000', '⌫')).toBe('100');
    expect(appliquerChiffreNumpad('', '5')).toBe('5');
    expect(appliquerChiffreNumpad('0', '5')).toBe('5');
    expect(appliquerChiffreNumpad('10', '0')).toBe('100');
  });

  it('bascule 2 modes vide les montants', () => {
    const next = toggleModePaiement(
      [{ mode: ModePaiement.ESPECES, montant: '2800' }],
      ModePaiement.CARTE,
      2800,
    );
    expect(next).toEqual([
      { mode: ModePaiement.ESPECES, montant: '' },
      { mode: ModePaiement.CARTE, montant: '' },
    ]);
  });
});
