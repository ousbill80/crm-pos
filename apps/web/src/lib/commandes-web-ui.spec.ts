import { describe, expect, it } from 'vitest';
import {
  etapesPourCommande,
  indexEtapeActive,
  prochaineActionWorkflow,
  type CommandeWebListItem,
} from './commandes-web-ui';

function base(
  overrides: Record<string, unknown> = {},
): CommandeWebListItem {
  return {
    id: 'cmd-1',
    statut: 'EN_ATTENTE_PAIEMENT',
    modeFulfillment: 'RETRAIT_BOUTIQUE',
    modeReglement: 'PREPAYE_PSP',
    montantTotal: '10000',
    createdAt: '2026-08-25T10:00:00.000Z',
    transitions: ['PAYEE', 'ANNULEE'],
    ...overrides,
  } as CommandeWebListItem;
}

describe('etapesPourCommande', () => {
  it('retrait prépayé = 5 étapes', () => {
    expect(etapesPourCommande(base()).map((e) => e.key)).toEqual([
      'paiement',
      'prep',
      'prete',
      'remise',
      'vente',
    ]);
  });

  it('retrait différé = 4 étapes sans paiement amont', () => {
    expect(
      etapesPourCommande(
        base({ modeReglement: 'PAIEMENT_RETRAIT', transitions: ['PREPARATION'] }),
      ).map((e) => e.key),
    ).toEqual(['prep', 'prete', 'remise', 'encaissement']);
  });

  it('livraison prépayée', () => {
    expect(
      etapesPourCommande(
        base({ modeFulfillment: 'LIVRAISON' }),
      ).map((e) => e.key),
    ).toEqual(['paiement', 'prep', 'expediee', 'livree', 'cloture']);
  });
});

describe('indexEtapeActive + prochaineActionWorkflow', () => {
  it('EN_ATTENTE → confirmer paiement', () => {
    const c = base();
    expect(indexEtapeActive(c)).toBe(0);
    const next = prochaineActionWorkflow(c);
    expect(next?.statut).toBe('PAYEE');
    expect(next?.label).toMatch(/paiement/i);
  });

  it('PAYEE prépayé → démarrer préparation', () => {
    const c = base({
      statut: 'PAYEE',
      transitions: ['PREPARATION', 'ANNULEE'],
    });
    expect(indexEtapeActive(c)).toBe(1);
    expect(prochaineActionWorkflow(c)?.statut).toBe('PREPARATION');
  });

  it('PREPARATION → marquer prête', () => {
    const c = base({
      statut: 'PREPARATION',
      transitions: ['PRETE', 'ANNULEE'],
    });
    expect(indexEtapeActive(c)).toBe(1);
    expect(prochaineActionWorkflow(c)?.statut).toBe('PRETE');
  });

  it('PRETE → remise', () => {
    const c = base({
      statut: 'PRETE',
      transitions: ['REMISE', 'ANNULEE'],
    });
    expect(indexEtapeActive(c)).toBe(2);
    expect(prochaineActionWorkflow(c)?.statut).toBe('REMISE');
  });

  it('REMISE → vente POS', () => {
    const c = base({
      statut: 'REMISE',
      transitions: [],
    });
    expect(indexEtapeActive(c)).toBe(3);
    expect(prochaineActionWorkflow(c)?.convertirVente).toBe(true);
  });

  it('conversion faite → plus de prochaine action', () => {
    const c = base({
      statut: 'REMISE',
      conversionVente: { venteId: 'v1' },
    });
    expect(indexEtapeActive(c)).toBe(4);
    expect(prochaineActionWorkflow(c)).toBeNull();
  });

  it('livraison EXPEDIEE → livrer', () => {
    const c = base({
      modeFulfillment: 'LIVRAISON',
      statut: 'EXPEDIEE',
      transitions: ['LIVREE'],
    });
    expect(indexEtapeActive(c)).toBe(2);
    expect(prochaineActionWorkflow(c)?.statut).toBe('LIVREE');
  });

  it('retrait différé PRETE → remise puis encaissement', () => {
    const c = base({
      modeReglement: 'PAIEMENT_RETRAIT',
      statut: 'PRETE',
      transitions: ['REMISE', 'PAYEE'],
    });
    expect(indexEtapeActive(c)).toBe(1);
    expect(prochaineActionWorkflow(c)?.statut).toBe('REMISE');
  });
});
