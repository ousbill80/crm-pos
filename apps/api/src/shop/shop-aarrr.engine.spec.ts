import {
  affiniteCategoriePourProduit,
  badgeDecouverte,
  construireProfilInteret,
  etapeAarrr,
  estActionFunnelClient,
  estActionFunnelServeur,
  rangerFeed,
  raisonPersonnalisation,
  scoreDecouverte,
  scorePourVous,
  syntheseAarrr,
  tauxPourcent,
  type ProduitSignal,
} from './shop-aarrr.engine';

function signal(partial: Partial<ProduitSignal> & { produitId: string }): ProduitSignal {
  return {
    ventes24h: 0,
    ventes7j: 0,
    ventes30j: 0,
    stockDisponible: null,
    vuesSession: 0,
    categorieVue: false,
    affiniteCategorie: 0,
    dansPanierSession: false,
    matchRecherche: false,
    ...partial,
  };
}

describe('shop-aarrr.engine', () => {
  it('mappe chaque action sur une étape AARRR', () => {
    expect(etapeAarrr('VIEW_HOME')).toBe('ACQUISITION');
    expect(etapeAarrr('ADD_CART')).toBe('ACTIVATION');
    expect(etapeAarrr('PURCHASE')).toBe('REVENUE');
    expect(etapeAarrr('REPEAT_PURCHASE')).toBe('RETENTION');
    expect(etapeAarrr('INSCRIPTION_PARRAINEE')).toBe('REFERRAL');
    expect(estActionFunnelClient('VIEW_PDP')).toBe(true);
    expect(estActionFunnelClient('PURCHASE')).toBe(false);
    expect(estActionFunnelServeur('PURCHASE')).toBe(true);
  });

  it('privilégie la vélocité réelle et la session, pas un stock à zéro', () => {
    const chaud = signal({
      produitId: 'a',
      ventes24h: 4,
      ventes7j: 8,
      ventes30j: 10,
    });
    const vu = signal({
      produitId: 'b',
      vuesSession: 3,
      categorieVue: true,
    });
    const rupture = signal({
      produitId: 'c',
      ventes30j: 20,
      stockDisponible: 0,
    });
    expect(scoreDecouverte(chaud)).toBeGreaterThan(scoreDecouverte(vu));
    expect(scoreDecouverte(vu)).toBeGreaterThan(scoreDecouverte(rupture) - 20);
    expect(badgeDecouverte(chaud)).toBe('Tendance');
    expect(
      badgeDecouverte(signal({ produitId: 'd', stockDisponible: 2 })),
    ).toBe('Stock limité');
    expect(
      badgeDecouverte(signal({ produitId: 'e', ventes30j: 8 })),
    ).toBe('Plus vendu');
  });

  it('sépare flash (24 h), pour vous (score) et tendances (30 j)', () => {
    const items = [
      { id: 'flash', signal: signal({ produitId: 'flash', ventes24h: 9 }) },
      {
        id: 'perso',
        signal: signal({
          produitId: 'perso',
          vuesSession: 20,
          ventes30j: 1,
          affiniteCategorie: 9,
        }),
      },
      {
        id: 'tendance',
        signal: signal({ produitId: 'tendance', ventes30j: 40 }),
      },
    ];
    const feed = rangerFeed(items, { flash: 1, pourVous: 1, tendances: 1 });
    expect(feed.flash[0]?.id).toBe('flash');
    expect(feed.pourVous[0]?.id).toBe('perso');
    expect(feed.tendances[0]?.id).toBe('tendance');
  });

  it('construit un profil d’intérêt à partir des vues, panier et recherches', () => {
    const meta = new Map([
      ['p1', { categorie: 'Phares' }],
      ['p2', { categorie: 'Jantes & Pneus' }],
    ]);
    const profil = construireProfilInteret(
      [
        { action: 'VIEW_PDP', produitId: 'p1' },
        { action: 'ADD_CART', produitId: 'p1' },
        { action: 'SEARCH', requete: 'led h7' },
        { action: 'VIEW_PDP', produitId: 'p2' },
      ],
      meta,
      (q) => (q.toLowerCase().includes('led') ? 'Phares' : null),
    );
    expect(profil.personnalise).toBe(true);
    expect(profil.categories[0]?.libelle).toBe('Phares');
    expect(profil.produitIds).toContain('p1');
    expect(
      affiniteCategoriePourProduit('Phares', profil),
    ).toBeGreaterThan(
      affiniteCategoriePourProduit('Accessoires Premium', profil),
    );
    const perso = signal({
      produitId: 'x',
      affiniteCategorie: 10,
      matchRecherche: true,
    });
    const froid = signal({ produitId: 'y', ventes30j: 5 });
    expect(scorePourVous(perso)).toBeGreaterThan(scorePourVous(froid));
    expect(raisonPersonnalisation(perso, profil)).toMatch(/Phares|led/i);
  });

  it('calcule les taux du funnel sans division par zéro', () => {
    expect(tauxPourcent(1, 0)).toBe(0);
    expect(tauxPourcent(1, 4)).toBe(25);
    const s = syntheseAarrr({
      sessionsAcquisition: 100,
      vuesHome: 80,
      vuesPdp: 40,
      recherches: 10,
      landings: 20,
      sessionsActivation: 25,
      ajoutsPanier: 30,
      inscriptions: 10,
      checkouts: 12,
      commandesPayees: 8,
      caTtc: 80_000,
      clientsRecurrents: 2,
      clientsAcheteurs: 5,
      partages: 3,
      inscriptionsParrainees: 1,
    });
    expect(s.activation.tauxActivation).toBe(25);
    expect(s.revenue.tauxConversion).toBe(8);
    expect(s.revenue.panierMoyen).toBe(10_000);
    expect(s.retention.partRecurrente).toBe(40);
    expect(s.referral.tauxParrainage).toBe(10);
  });
});
