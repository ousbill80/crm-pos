import { RoleLibelle } from '@caisse-crm/shared';
import {
  astucesShop,
  classementBoutiques,
  cleSemaineIso,
  estDernierJourDuMois,
  inactifDepuisHeures,
  jourCleAbidjan,
  messageRelance,
  partCa,
  pointsAttentionVentes,
  shopNecessiteAttention,
} from './staff-briefing.engine';

describe('staff-briefing.engine', () => {
  it('détecte le dernier jour du mois (UTC = Abidjan)', () => {
    expect(estDernierJourDuMois(new Date('2026-08-31T22:00:00Z'))).toBe(true);
    expect(estDernierJourDuMois(new Date('2026-08-30T22:00:00Z'))).toBe(false);
    expect(estDernierJourDuMois(new Date('2026-02-28T12:00:00Z'))).toBe(true);
  });

  it('calcule une clé de semaine ISO stable', () => {
    expect(cleSemaineIso(new Date('2026-08-31T08:00:00Z'))).toBe('2026-W36');
  });

  it('classe les boutiques par CA réel', () => {
    const rows = classementBoutiques([
      { nom: 'B', ca: 10, tickets: 2 },
      { nom: 'A', ca: 50, tickets: 1 },
    ]);
    expect(rows[0]?.nom).toBe('A');
    expect(partCa(50, 100)).toBe(50);
    expect(partCa(1, 0)).toBe(0);
  });

  it('signale litiges, retards et absence de web', () => {
    const pts = pointsAttentionVentes({
      periodeLabel: 'j',
      caReseau: 1000,
      tickets: 3,
      parBoutique: [],
      caWeb: 0,
      commandesWeb: 0,
      litigesOuverts: 2,
      versementsEnRetard: 1,
    });
    expect(pts.some((p) => /litige/i.test(p))).toBe(true);
    expect(pts.some((p) => /versement/i.test(p))).toBe(true);
    expect(pts.some((p) => /100 % magasin/i.test(p))).toBe(true);
  });

  it('n’alerte le shop que s’il est actif et non alimenté / sans commande', () => {
    expect(
      shopNecessiteAttention({
        shopActif: false,
        produitsVisibles: 0,
        commandes7j: 0,
        sessions7j: 0,
      }),
    ).toBe(false);
    expect(
      shopNecessiteAttention({
        shopActif: true,
        produitsVisibles: 0,
        commandes7j: 0,
        sessions7j: 0,
      }),
    ).toBe(true);
    expect(
      shopNecessiteAttention({
        shopActif: true,
        produitsVisibles: 12,
        commandes7j: 0,
        sessions7j: 40,
      }),
    ).toBe(true);
    expect(
      shopNecessiteAttention({
        shopActif: true,
        produitsVisibles: 12,
        commandes7j: 2,
        sessions7j: 40,
      }),
    ).toBe(false);
  });

  it('adapte relance et astuces au rôle', () => {
    expect(inactifDepuisHeures(null, new Date(), 48)).toBe(true);
    expect(
      inactifDepuisHeures(new Date('2026-08-28T10:00:00Z'), new Date('2026-08-28T12:00:00Z'), 48),
    ).toBe(false);
    expect(
      inactifDepuisHeures(new Date('2026-08-26T10:00:00Z'), new Date('2026-08-28T12:00:00Z'), 48),
    ).toBe(true);
    const dg = messageRelance(RoleLibelle.DIRECTION_GENERALE, 72);
    const daf = messageRelance(RoleLibelle.DAF, 72);
    const central = messageRelance(RoleLibelle.CAISSIER_CENTRAL, 72);
    expect(dg.objet).not.toBe(daf.objet);
    expect(dg.objet).not.toBe(central.objet);
    expect(dg.pourquoi).toMatch(/§6\.4/);
    expect(central.pourquoi).toMatch(/réceptionn/i);
    const astuceSi = astucesShop(
      { shopActif: true, produitsVisibles: 0, commandes7j: 0, sessions7j: 0 },
      RoleLibelle.RESPONSABLE_SI,
    );
    expect(astuceSi[0]).toMatch(/visibleWeb/i);
  });

  it('formate le jour Abidjan en YYYY-MM-DD', () => {
    expect(jourCleAbidjan(new Date('2026-08-28T23:30:00Z'))).toBe('2026-08-28');
  });
});
