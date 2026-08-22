import { describe, expect, it } from 'vitest';
import {
  formatDureeAttente,
  formatNumeroAttente,
  holdsDepuisApi,
  holdsFifo,
  labelMotif,
  montantHold,
  nbArticlesHold,
  payloadReservation,
  prochainNumero,
  quantiteParquee,
  type CommandeEnAttente,
  type LignePanierHold,
} from './pos-holds';

function ligne(overrides: Partial<LignePanierHold> = {}): LignePanierHold {
  return {
    produitId: 'p1',
    designation: 'Produit 1',
    reference: 'REF-1',
    prixUnitaire: '1000',
    stock: 10,
    quantite: 2,
    remise: 0,
    ...overrides,
  };
}

function hold(overrides: Partial<CommandeEnAttente> = {}): CommandeEnAttente {
  return {
    id: 'h1',
    numero: 1,
    libelle: 'Ticket 1',
    motif: 'OUBLI_PAIEMENT',
    clientId: null,
    panier: [ligne()],
    remisePanier: '',
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('quantiteParquee', () => {
  it('additionne la quantité d’un produit sur plusieurs tickets en attente', () => {
    const holds = [
      hold({ id: 'h1', panier: [ligne({ produitId: 'a', quantite: 2 })] }),
      hold({ id: 'h2', panier: [ligne({ produitId: 'a', quantite: 3 })] }),
    ];
    expect(quantiteParquee(holds, 'a')).toBe(5);
  });

  it('ignore les produits non concernés', () => {
    const holds = [
      hold({ id: 'h1', panier: [ligne({ produitId: 'a', quantite: 2 })] }),
      hold({ id: 'h2', panier: [ligne({ produitId: 'b', quantite: 7 })] }),
    ];
    expect(quantiteParquee(holds, 'a')).toBe(2);
    expect(quantiteParquee(holds, 'z')).toBe(0);
  });

  it('retourne 0 pour une file vide', () => {
    expect(quantiteParquee([], 'a')).toBe(0);
  });
});

describe('holdsDepuisApi', () => {
  it('normalise une réponse serveur bien formée', () => {
    const raw = [
      {
        id: 'h1',
        numero: 3,
        libelle: 'Client X',
        motif: 'FIDELITE',
        clientId: 'c1',
        panier: [ligne()],
        remisePanier: '10',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    const result = holdsDepuisApi(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'h1',
      numero: 3,
      libelle: 'Client X',
      motif: 'FIDELITE',
      clientId: 'c1',
      remisePanier: '10',
    });
  });

  it('retourne [] si la valeur n’est pas un tableau', () => {
    expect(holdsDepuisApi(null)).toEqual([]);
    expect(holdsDepuisApi(undefined)).toEqual([]);
    expect(holdsDepuisApi('nope')).toEqual([]);
    expect(holdsDepuisApi({})).toEqual([]);
  });

  it('filtre les entrées invalides et applique des valeurs par défaut sûres pour les entrées partielles', () => {
    const raw = [
      null,
      42,
      { id: 'ok-no-panier' }, // pas de panier -> invalide
      {
        id: 'ok-partiel',
        panier: [],
        // numero manquant -> 0 par défaut
        // libelle manquant -> 'Ticket'
        // motif invalide -> 'AUTRE'
        motif: 'INCONNU',
        clientId: 42, // type incorrect -> null
      },
    ];
    const result = holdsDepuisApi(raw);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: 'ok-partiel',
      numero: 0,
      libelle: 'Ticket',
      motif: 'AUTRE',
      clientId: null,
      remisePanier: '',
    });
    expect(typeof result[0].createdAt).toBe('string');
  });
});

describe('prochainNumero', () => {
  it('démarre à 1 pour une liste vide', () => {
    expect(prochainNumero([])).toBe(1);
  });

  it('incrémente correctement malgré des trous dans la numérotation', () => {
    const holds = [hold({ numero: 1 }), hold({ id: 'h2', numero: 5 })];
    expect(prochainNumero(holds)).toBe(6);
  });
});

describe('montantHold / nbArticlesHold', () => {
  it('calcule le nombre d’articles (somme des quantités)', () => {
    const panier = [
      ligne({ produitId: 'a', quantite: 2 }),
      ligne({ produitId: 'b', quantite: 3 }),
    ];
    expect(nbArticlesHold(panier)).toBe(5);
  });

  it('calcule le montant net (prix × quantité − remise ligne)', () => {
    const panier = [
      ligne({ produitId: 'a', prixUnitaire: '1000', quantite: 2, remise: 0 }),
      ligne({ produitId: 'b', prixUnitaire: '500', quantite: 3, remise: 100 }),
    ];
    // (1000*2 - 0) + (500*3 - 100) = 2000 + 1400 = 3400
    expect(montantHold(panier)).toBe(3400);
  });
});

describe('formatDureeAttente', () => {
  it('affiche en secondes sous la minute', () => {
    const createdAt = new Date(0).toISOString();
    expect(formatDureeAttente(createdAt, 45_000)).toBe('45 s');
  });

  it('affiche en minutes sous l’heure', () => {
    const createdAt = new Date(0).toISOString();
    expect(formatDureeAttente(createdAt, 5 * 60_000)).toBe('5 min');
  });

  it('affiche en heures + minutes au-delà de l’heure', () => {
    const createdAt = new Date(0).toISOString();
    const now = (2 * 60 + 15) * 60_000; // 2h15
    expect(formatDureeAttente(createdAt, now)).toBe('2 h 15 min');
  });

  it('ne descend jamais sous 0 s (horloge incohérente)', () => {
    const createdAt = new Date(10_000).toISOString();
    expect(formatDureeAttente(createdAt, 0)).toBe('0 s');
  });
});

describe('payloadReservation', () => {
  it('façonne le corps PUT attendu par le serveur', () => {
    const h = hold({
      id: 'h9',
      numero: 4,
      libelle: 'N° 04',
      motif: 'ARTICLE',
      clientId: 'c9',
      remisePanier: '5',
      panier: [
        ligne({ produitId: 'a', quantite: 2, remise: 50 }),
        ligne({ produitId: 'b', quantite: 1, remise: 0 }),
      ],
    });
    const body = payloadReservation(h);
    expect(body).toMatchObject({
      holdId: 'h9',
      numero: 4,
      libelle: 'N° 04',
      motif: 'ARTICLE',
      clientId: 'c9',
      remisePanier: '5',
    });
    expect(body.lignes).toEqual([
      { produitId: 'a', quantite: 2 },
      { produitId: 'b', quantite: 1 },
    ]);
    // Le panier complet (snapshot) reste inclus, remise/désignation comprises.
    expect(body.panier).toEqual(h.panier);
  });
});

describe('labelMotif / formatNumeroAttente / holdsFifo', () => {
  it('retourne le libellé attendu pour chaque motif', () => {
    expect(labelMotif('OUBLI_PAIEMENT')).toBe('Oubli moyen de paiement');
    expect(labelMotif('ARTICLE')).toBe('Va chercher un article');
    expect(labelMotif('FIDELITE')).toBe('Carte / fiche client');
    expect(labelMotif('AUTRE')).toBe('Autre');
  });

  it('formate le numéro sur 2 chiffres', () => {
    expect(formatNumeroAttente(4)).toBe('04');
    expect(formatNumeroAttente(12)).toBe('12');
  });

  it('trie les tickets par ordre d’arrivée (FIFO)', () => {
    const holds = [
      hold({ id: 'h2', createdAt: '2026-01-01T10:02:00.000Z' }),
      hold({ id: 'h1', createdAt: '2026-01-01T10:01:00.000Z' }),
    ];
    expect(holdsFifo(holds).map((h) => h.id)).toEqual(['h1', 'h2']);
  });
});
