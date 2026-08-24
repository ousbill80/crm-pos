import { describe, expect, it } from 'vitest';
import { ModePaiement } from '@caisse-crm/shared';
import {
  appliquerRemisePanier,
  arrondiFcfa,
  atteintLimiteStock,
  construirePaiements,
  especesRecuesOk,
  modePrincipal,
  monnaieARendre,
  montantRemiseDepuisPourcent,
  montantRestePart,
  paiementsDepuisParts,
  partEspeces,
  partsInitiales,
  plafondRemise,
  recuEspecesParDefaut,
  repartitionComplete,
  remiseFideliteFcfa,
  resteARepartir,
  stockDisponible,
  syntheseEncaissement,
  toggleModePaiement,
  totalBrut,
  totalNet,
  type LignePanier,
  type PartPaiement,
} from './pos-panier';

const lignes = (): LignePanier[] => [
  {
    produitId: 'a',
    designation: 'A',
    prixUnitaire: '1000',
    quantite: 2,
    remise: 0,
  },
  {
    produitId: 'b',
    designation: 'B',
    prixUnitaire: '500',
    quantite: 1,
    remise: 0,
  },
];

describe('arrondis FCFA', () => {
  it('arrondit à l’unité', () => {
    expect(arrondiFcfa(10.4)).toBe(10);
    expect(arrondiFcfa(10.5)).toBe(11);
    expect(arrondiFcfa(Number.NaN)).toBe(0);
  });
});

describe('totaux & remise %', () => {
  it('brut / net sans remise', () => {
    expect(totalBrut(lignes())).toBe(2500);
    expect(totalNet(lignes())).toBe(2500);
  });

  it('répartit la remise panier sans dépasser le brut', () => {
    const avec = appliquerRemisePanier(lignes(), 300);
    expect(totalNet(avec)).toBe(2200);
    expect(avec.reduce((s, l) => s + l.remise, 0)).toBe(300);
  });

  it('plafond remise 20 %', () => {
    expect(plafondRemise(10000)).toBe(2000);
    expect(montantRemiseDepuisPourcent(10000, 10)).toBe(1000);
    expect(montantRemiseDepuisPourcent(10000, 20)).toBe(2000);
    expect(montantRemiseDepuisPourcent(10000, 25)).toBe(2500);
    expect(montantRemiseDepuisPourcent(3200, 10)).toBe(320);
  });

  it('ne dépasse jamais 20 % par ligne sans dérogation, même avec les arrondis', () => {
    const panier: LignePanier[] = [
      { produitId: 'a', designation: 'A', prixUnitaire: '1', quantite: 1, remise: 0 },
      { produitId: 'b', designation: 'B', prixUnitaire: '99', quantite: 1, remise: 0 },
      { produitId: 'c', designation: 'C', prixUnitaire: '9900', quantite: 1, remise: 0 },
    ];
    const avec = appliquerRemisePanier(panier, 2000);
    expect(avec[0]?.remise).toBeLessThanOrEqual(0);
    expect(avec[1]?.remise).toBeLessThanOrEqual(19);
    expect(avec[2]?.remise).toBeLessThanOrEqual(1980);
  });

  it('calcule l’avantage fidélité en FCFA entiers comme le serveur', () => {
    expect(remiseFideliteFcfa(9500, 5)).toBe(475);
    expect(remiseFideliteFcfa(999, 2.5)).toBe(25);
    expect(remiseFideliteFcfa(1000, 0)).toBe(0);
  });

  it('10 % sur ticket 3200 → net 2880', () => {
    const panier: LignePanier[] = [
      {
        produitId: 'x',
        designation: 'Chargeur',
        prixUnitaire: '3200',
        quantite: 1,
        remise: 0,
      },
    ];
    const montant = montantRemiseDepuisPourcent(totalBrut(panier), 10);
    const avec = appliquerRemisePanier(panier, montant);
    expect(montant).toBe(320);
    expect(totalNet(avec)).toBe(2880);
  });
});

describe('répartition mixte', () => {
  it('espèces + carte = total exact (cas ticket 3200)', () => {
    const parts: PartPaiement[] = [
      { mode: ModePaiement.ESPECES, montant: '1000' },
      { mode: ModePaiement.CARTE, montant: '2200' },
    ];
    expect(repartitionComplete(3200, parts)).toBe(true);
    expect(resteARepartir(3200, parts)).toBe(0);
    expect(partEspeces(parts)).toBe(1000);
  });

  it('espèces 2000 + carte 1200 = 3200', () => {
    const parts: PartPaiement[] = [
      { mode: ModePaiement.ESPECES, montant: '2000' },
      { mode: ModePaiement.CARTE, montant: '1200' },
    ];
    expect(repartitionComplete(3200, parts)).toBe(true);
    expect(partEspeces(parts)).toBe(2000);
  });

  it('refuse une répartition incomplète', () => {
    const parts: PartPaiement[] = [
      { mode: ModePaiement.ESPECES, montant: '1000' },
      { mode: ModePaiement.CARTE, montant: '1000' },
    ];
    expect(repartitionComplete(3200, parts)).toBe(false);
    expect(resteARepartir(3200, parts)).toBe(1200);
  });

  it('toggle multi-modes', () => {
    let parts = partsInitiales(5000);
    parts = toggleModePaiement(parts, ModePaiement.CARTE, 5000);
    expect(parts.map((p) => p.mode)).toEqual([
      ModePaiement.ESPECES,
      ModePaiement.CARTE,
    ]);
  });

  it('montantRestePart complète la répartition', () => {
    const parts: PartPaiement[] = [
      { mode: ModePaiement.ESPECES, montant: '' },
      { mode: ModePaiement.CARTE, montant: '1000' },
    ];
    expect(montantRestePart(3040, parts, ModePaiement.ESPECES)).toBe(2040);
  });
});

describe('monnaie — jamais total ticket en mixte', () => {
  it('cas bug audit : Espèces 1000 + Carte 2200, Exact → monnaie 0', () => {
    const parts: PartPaiement[] = [
      { mode: ModePaiement.ESPECES, montant: '1000' },
      { mode: ModePaiement.CARTE, montant: '2200' },
    ];
    const cash = partEspeces(parts);
    const recu = Number(recuEspecesParDefaut(cash));
    expect(cash).toBe(1000);
    expect(recu).toBe(1000);
    expect(monnaieARendre(recu, cash)).toBe(0);
    // Erreur historique : reçu = total ticket
    expect(monnaieARendre(3200, cash)).toBe(2200);
    expect(monnaieARendre(3200, cash)).not.toBe(0);
  });

  it('cas screenshot : Espèces 2000 + Carte 1200, Exact → monnaie 0', () => {
    const s = syntheseEncaissement({
      totalNet: 3200,
      parts: [
        { mode: ModePaiement.ESPECES, montant: '2000' },
        { mode: ModePaiement.CARTE, montant: '1200' },
      ],
      recuEspeces: 2000,
    });
    expect(s.repartitionOk).toBe(true);
    expect(s.cashPart).toBe(2000);
    expect(s.monnaie).toBe(0);
    expect(s.peutValider).toBe(true);
  });

  it('reçu 5000 sur part 2000 → monnaie 3000', () => {
    const s = syntheseEncaissement({
      totalNet: 3200,
      parts: [
        { mode: ModePaiement.ESPECES, montant: '2000' },
        { mode: ModePaiement.CARTE, montant: '1200' },
      ],
      recuEspeces: 5000,
    });
    expect(s.monnaie).toBe(3000);
    expect(s.especesOk).toBe(true);
  });

  it('reçu insuffisant → pas de validation', () => {
    const s = syntheseEncaissement({
      totalNet: 3200,
      parts: [
        { mode: ModePaiement.ESPECES, montant: '2000' },
        { mode: ModePaiement.CARTE, montant: '1200' },
      ],
      recuEspeces: 1500,
    });
    expect(s.especesOk).toBe(false);
    expect(s.peutValider).toBe(false);
    expect(s.monnaie).toBe(-500);
  });

  it('carte seule : pas de monnaie', () => {
    const s = syntheseEncaissement({
      totalNet: 3200,
      parts: [{ mode: ModePaiement.CARTE, montant: '3200' }],
      recuEspeces: 99999,
    });
    expect(s.aEspeces).toBe(false);
    expect(s.monnaie).toBe(0);
    expect(s.peutValider).toBe(true);
  });

  it('especesRecuesOk', () => {
    const parts = [{ mode: ModePaiement.ESPECES, montant: '5000' }];
    expect(especesRecuesOk(5000, parts)).toBe(true);
    expect(especesRecuesOk(4999, parts)).toBe(false);
    expect(
      especesRecuesOk(0, [{ mode: ModePaiement.CARTE, montant: '1000' }]),
    ).toBe(true);
  });

  it('cas ticket 3040 : espèces 2040 + carte 1000, billet 10000 → monnaie 7960', () => {
    const s = syntheseEncaissement({
      totalNet: 3040,
      parts: [
        { mode: ModePaiement.ESPECES, montant: '2040' },
        { mode: ModePaiement.CARTE, montant: '1000' },
      ],
      recuEspeces: 10_000,
    });
    expect(s.repartitionOk).toBe(true);
    expect(s.cashPart).toBe(2040);
    expect(s.monnaie).toBe(7960);
    expect(s.peutValider).toBe(true);
  });

  it('sur-allocation 10000+1000 sur ticket 3040 → bloqué', () => {
    const s = syntheseEncaissement({
      totalNet: 3040,
      parts: [
        { mode: ModePaiement.ESPECES, montant: '10000' },
        { mode: ModePaiement.CARTE, montant: '1000' },
      ],
      recuEspeces: 10_000,
    });
    expect(s.repartitionOk).toBe(false);
    expect(s.peutValider).toBe(false);
  });
});

describe('stock — plafond quantité au panier', () => {
  it('stockDisponible plafonne au stock restant', () => {
    expect(stockDisponible(10, 3)).toBe(7);
    expect(stockDisponible(10, 0)).toBe(10);
    expect(stockDisponible(10, 10)).toBe(0);
  });

  it('stockDisponible ne descend jamais sous zéro', () => {
    expect(stockDisponible(5, 8)).toBe(0);
    expect(stockDisponible(0, 0)).toBe(0);
  });

  it('soustrait les tickets en attente et les ventes non synchronisées', () => {
    expect(stockDisponible(10, 2, 3, 4)).toBe(1);
    expect(stockDisponible(5, 0, 4, 2)).toBe(0);
  });

  it('atteintLimiteStock détecte qu’une unité de plus dépasserait le stock', () => {
    expect(atteintLimiteStock(5, 4)).toBe(false);
    expect(atteintLimiteStock(5, 5)).toBe(true);
    expect(atteintLimiteStock(5, 6)).toBe(true);
    expect(atteintLimiteStock(0, 0)).toBe(true);
  });
});

describe('legacy construirePaiements', () => {
  it('simple et mixte', () => {
    expect(
      construirePaiements(1000, ModePaiement.CARTE, false, 0, ModePaiement.CARTE),
    ).toEqual([{ modePaiement: ModePaiement.CARTE, montant: 1000 }]);
    const mixte = construirePaiements(
      1000,
      ModePaiement.MOBILE_MONEY,
      true,
      400,
      ModePaiement.MOBILE_MONEY,
    );
    expect(mixte).toEqual([
      { modePaiement: ModePaiement.ESPECES, montant: 400 },
      { modePaiement: ModePaiement.MOBILE_MONEY, montant: 600 },
    ]);
    expect(modePrincipal(mixte)).toBe(ModePaiement.ESPECES);
    expect(modePrincipal(paiementsDepuisParts(partsInitiales(100)))).toBe(
      ModePaiement.ESPECES,
    );
  });
});
