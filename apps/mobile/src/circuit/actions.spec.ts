import { describe, expect, it } from 'vitest';
import { RoleLibelle, StatutTransaction, TypeTransaction } from '@caisse-crm/shared';
import {
  accesTresorerieMobile,
  accueilOnglet,
  ongletsMobile,
  peutEncaisserPos,
  peutNouveauVersement,
  peutPasserEnTransit,
  peutRapprocher,
  peutReceptionner,
  peutRegulariser,
} from './actions';

describe('visibilité mobile — constantes @caisse-crm/shared (§4 / §6.4)', () => {
  it('caissier : POS, pas de Nouveau versement, pas de réception', () => {
    const r = RoleLibelle.CAISSIER_BOUTIQUE;
    expect(peutEncaisserPos(r)).toBe(true);
    expect(ongletsMobile(r)).toEqual([
      'Caisse',
      'Circuit',
      'Caisses',
      'Inventaire',
    ]);
    expect(accueilOnglet(r)).toBe('Caisse');
    expect(peutNouveauVersement(r)).toBe(false);
    expect(peutPasserEnTransit(r, StatutTransaction.INITIEE)).toBe(false);
    expect(peutReceptionner(r, StatutTransaction.EN_TRANSIT)).toBe(false);
    expect(peutRapprocher(r, StatutTransaction.RECEPTIONNEE)).toBe(false);
  });

  it('responsable boutique : POS + initiation SORTIE_FONDS + transit + régul interne', () => {
    const r = RoleLibelle.RESPONSABLE_BOUTIQUE;
    expect(peutEncaisserPos(r)).toBe(true);
    expect(peutNouveauVersement(r)).toBe(true);
    expect(peutPasserEnTransit(r, StatutTransaction.INITIEE)).toBe(true);
    expect(peutReceptionner(r, StatutTransaction.EN_TRANSIT)).toBe(false);
    expect(
      peutRegulariser(r, StatutTransaction.LITIGE, TypeTransaction.TRANSFERT_INTERNE),
    ).toBe(true);
    expect(
      peutRegulariser(r, StatutTransaction.LITIGE, TypeTransaction.SORTIE_FONDS),
    ).toBe(false);
  });

  it('convoyeur : pas de POS, transit seulement', () => {
    const r = RoleLibelle.CONVOYEUR;
    expect(peutEncaisserPos(r)).toBe(false);
    expect(ongletsMobile(r)).toEqual(['Circuit', 'Caisses']);
    expect(accueilOnglet(r)).toBe('Circuit');
    expect(peutNouveauVersement(r)).toBe(false);
    expect(peutPasserEnTransit(r, StatutTransaction.INITIEE)).toBe(true);
    expect(peutReceptionner(r, StatutTransaction.EN_TRANSIT)).toBe(false);
  });

  it('caissier central / DAF : pas de POS, réception + rapprochement', () => {
    for (const r of [RoleLibelle.CAISSIER_CENTRAL, RoleLibelle.DAF]) {
      expect(peutEncaisserPos(r)).toBe(false);
      expect(ongletsMobile(r)).toContain('Circuit');
      expect(ongletsMobile(r)).not.toContain('Caisse');
      expect(peutNouveauVersement(r)).toBe(false);
      expect(peutReceptionner(r, StatutTransaction.EN_TRANSIT)).toBe(true);
      expect(peutRapprocher(r, StatutTransaction.RECEPTIONNEE)).toBe(true);
    }
  });

  it('contrôleur interne : régularise SORTIE_FONDS, ne réceptionne pas', () => {
    const r = RoleLibelle.CONTROLEUR_INTERNE;
    expect(peutReceptionner(r, StatutTransaction.EN_TRANSIT)).toBe(false);
    expect(
      peutRegulariser(r, StatutTransaction.LITIGE, TypeTransaction.SORTIE_FONDS),
    ).toBe(true);
    expect(
      peutRegulariser(r, StatutTransaction.LITIGE, TypeTransaction.TRANSFERT_INTERNE),
    ).toBe(false);
  });

  it('DG : rapprochement seuils, pas de POS', () => {
    const r = RoleLibelle.DIRECTION_GENERALE;
    expect(peutEncaisserPos(r)).toBe(false);
    expect(peutRapprocher(r, StatutTransaction.RECEPTIONNEE)).toBe(true);
    expect(peutReceptionner(r, StatutTransaction.EN_TRANSIT)).toBe(false);
  });

  it('SI et CRM : hors périmètre trésorerie (SI peut avoir inventaire)', () => {
    expect(accesTresorerieMobile(RoleLibelle.RESPONSABLE_SI)).toBe(false);
    expect(accesTresorerieMobile(RoleLibelle.RESPONSABLE_CRM)).toBe(false);
    expect(ongletsMobile(RoleLibelle.RESPONSABLE_SI)).not.toContain('Caisse');
    expect(ongletsMobile(RoleLibelle.RESPONSABLE_SI)).not.toContain('Circuit');
    expect(ongletsMobile(RoleLibelle.RESPONSABLE_CRM)).toEqual([]);
  });
});
