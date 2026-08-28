import { describe, expect, it, vi } from 'vitest';
import { ModePaiement } from '@caisse-crm/shared';

vi.mock('expo-print', () => ({ printAsync: vi.fn() }));
vi.mock('react-native', () => ({ Platform: { OS: 'web' } }));

import { buildTicketCaisseHtml } from './ticket-caisse-print';

describe('buildTicketCaisseHtml — logo MAJOR AUTO PARTS', () => {
  const html = buildTicketCaisseHtml({
    ticket: {
      id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
      dateVente: '2026-08-24T10:00:00.000Z',
      montantTotal: 2500,
      modePaiement: ModePaiement.ESPECES,
      lignes: [
        {
          quantite: 1,
          prixUnitaire: 2500,
          produit: { designation: 'Filtre huile' },
        },
      ],
    },
    boutiqueNom: 'Showroom Plateau',
  });

  it('pose le logo typographique MAJOR / AUTO PARTS en tête de ticket', () => {
    expect(html).toContain('aria-label="MAJOR AUTO PARTS"');
    expect(html).toContain('class="logo-major">MAJOR</span>');
    expect(html).toContain('class="logo-auto">AUTO PARTS</span>');
  });

  it('n’imprime plus le libellé générique CaissePOS comme enseigne', () => {
    expect(html).not.toMatch(/class="[^"]*brand[^"]*">CaissePOS/);
  });
});
