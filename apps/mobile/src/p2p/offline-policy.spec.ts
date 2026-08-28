import { describe, expect, it } from 'vitest';
import { classifyP2pMutation } from './offline-policy';

describe('classification hors ligne P2P', () => {
  it('autorise seulement les opérations physiques terrain prévues', () => {
    expect(classifyP2pMutation('/achats/receptions')).toBe('TERRAIN_ALLOWED');
    expect(classifyP2pMutation('/achats/receptions/abc/qualite')).toBe('TERRAIN_ALLOWED');
    expect(classifyP2pMutation('/achats/receptions/abc/putaway')).toBe('TERRAIN_ALLOWED');
    expect(classifyP2pMutation('/achats/receptions/abc/retours')).toBe('TERRAIN_ALLOWED');
  });

  it('ne met jamais en file finance, approbation, paiement ou IA', () => {
    expect(classifyP2pMutation('/achats/demandes/a/approuver')).toBe('ONLINE_ONLY');
    expect(classifyP2pMutation('/achats/factures/a/comptabiliser')).toBe('ONLINE_ONLY');
    expect(classifyP2pMutation('/achats/comptabilite/paiements/propositions/a/executer')).toBe('ONLINE_ONLY');
    expect(classifyP2pMutation('/accounting-ai/suggestions/a/decision')).toBe('ONLINE_ONLY');
    expect(classifyP2pMutation('/achats/evidences')).toBe('ONLINE_ONLY');
  });

  it('refuse par défaut toute nouvelle mutation non classée', () => {
    expect(classifyP2pMutation('/achats/commandes/a/production')).toBe('ONLINE_ONLY');
  });
});
