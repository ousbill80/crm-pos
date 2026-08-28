import { describe, expect, it } from 'vitest';
import { RoleLibelle } from '@caisse-crm/shared';
import { canP2p, hasP2pMobileAccess } from './permissions';

describe('permissions P2P mobile', () => {
  it('interdit toute validation procurement au caissier boutique', () => {
    expect(hasP2pMobileAccess(RoleLibelle.CAISSIER_BOUTIQUE)).toBe(false);
    expect(canP2p(RoleLibelle.CAISSIER_BOUTIQUE, 'REQUEST_APPROVE')).toBe(false);
    expect(canP2p(RoleLibelle.CAISSIER_BOUTIQUE, 'RECEIPT')).toBe(false);
    expect(canP2p(RoleLibelle.CAISSIER_BOUTIQUE, 'PAYMENT_EXECUTE')).toBe(false);
  });

  it('sépare saisie, réception, qualité, comptabilité et paiement', () => {
    expect(canP2p(RoleLibelle.ACHATS, 'REQUEST_WRITE')).toBe(true);
    expect(canP2p(RoleLibelle.ACHATS, 'REQUEST_APPROVE')).toBe(false);
    expect(canP2p(RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE, 'RECEIPT')).toBe(true);
    expect(canP2p(RoleLibelle.LOGISTIQUE_TRANSIT_DOUANE, 'QUALITY')).toBe(false);
    expect(canP2p(RoleLibelle.QUALITE_STOCKS, 'QUALITY')).toBe(true);
    expect(canP2p(RoleLibelle.QUALITE_STOCKS, 'ACCOUNTING')).toBe(false);
    expect(canP2p(RoleLibelle.RAF_COMPTABLE, 'ACCOUNTING')).toBe(true);
    expect(canP2p(RoleLibelle.RAF_COMPTABLE, 'PAYMENT_APPROVE')).toBe(false);
    expect(canP2p(RoleLibelle.DAF, 'PAYMENT_APPROVE')).toBe(true);
  });

  it('réserve les seuils exceptionnels à la DG', () => {
    expect(canP2p(RoleLibelle.DIRECTION_GENERALE, 'PAYMENT_EXCEPTION')).toBe(true);
    expect(canP2p(RoleLibelle.DAF, 'PAYMENT_EXCEPTION')).toBe(false);
  });
});
