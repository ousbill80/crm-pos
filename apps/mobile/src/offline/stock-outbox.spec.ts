import { describe, expect, it } from 'vitest';
import type { OutboxOp } from '@caisse-crm/offline';
import { quantiteProduitDansVentesOutbox } from './stock-outbox';

const op = (
  path: string,
  lignes: Array<{ produitId: string; quantite: number }>,
): OutboxOp => ({
  id: path + JSON.stringify(lignes),
  path,
  method: 'POST',
  body: { lignes },
  createdAt: '2026-08-24T00:00:00.000Z',
});

describe('quantiteProduitDansVentesOutbox', () => {
  it('cumule uniquement les lignes de ventes locales du produit', () => {
    const ops = [
      op('/ventes/sessions/s1/ventes', [
        { produitId: 'p1', quantite: 2 },
        { produitId: 'p2', quantite: 9 },
      ]),
      op('/ventes/sessions/s2/ventes', [{ produitId: 'p1', quantite: 3 }]),
      op('/transactions', [{ produitId: 'p1', quantite: 100 }]),
    ];
    expect(quantiteProduitDansVentesOutbox(ops, 'p1')).toBe(5);
    expect(quantiteProduitDansVentesOutbox(ops, 'p2')).toBe(9);
  });

  it('ignore les quantités invalides', () => {
    const ops = [
      op('/ventes/sessions/s1/ventes', [
        { produitId: 'p1', quantite: -1 },
        { produitId: 'p1', quantite: Number.NaN },
      ]),
    ];
    expect(quantiteProduitDansVentesOutbox(ops, 'p1')).toBe(0);
  });
});
