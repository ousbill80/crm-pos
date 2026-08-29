import { RoleLibelle } from '@caisse-crm/shared';
import {
  assemblerSnapshotVentes,
  synthetiserCompteResultat,
} from './staff-briefing.engine';
import { renderBriefing, type LiensBriefing } from './staff-briefing.templates';
import { echantillonsIllustration } from './staff-briefing-echantillons';

const liens: LiensBriefing = {
  crm: 'https://crm.example',
  shop: 'https://www.example',
  dashboard: 'https://crm.example/dashboard',
  finance: 'https://crm.example/finance',
  croissance: 'https://crm.example/clients/croissance',
};

const ventes = assemblerSnapshotVentes({
  horizon: 'JOUR',
  periodeLabel: '2026-08-29',
  caReseau: 450_000,
  tickets: 18,
  parBoutique: [
    { nom: 'Marcory', ca: 250_000, tickets: 10 },
    { nom: 'Yopougon', ca: 200_000, tickets: 8 },
    { nom: 'Plateau', ca: 0, tickets: 0 },
  ],
  caWeb: 50_000,
  commandesWeb: 2,
  mixPaiement: [
    { mode: 'ESPECES', montant: 300_000, tickets: 12 },
    { mode: 'MOBILE_MONEY', montant: 150_000, tickets: 6 },
  ],
  litigesOuverts: 0,
  versementsEnRetard: 1,
  boutiquesTotal: 3,
  caPrecedent: 400_000,
  ticketsPrecedent: 16,
});

describe('templates briefing ventes', () => {
  it('l’état du soir affiche KPIs, classement et mix', () => {
    const mail = renderBriefing('SOIR', RoleLibelle.DAF, 'Mariam', {
      ventes,
      liens,
    });
    expect(mail.objet).toMatch(/2026-08-29/);
    expect(mail.html).toContain('Panier moyen');
    expect(mail.html).toContain('Classement des magasins');
    expect(mail.html).toContain('Marcory');
    expect(mail.html).toContain('Encaissements par mode');
    expect(mail.html).toContain('Espèces');
    expect(mail.text).toContain('panier');
  });

  it('l’état hebdo reprend le bloc ventes KPI avant la finance', () => {
    const gl = synthetiserCompteResultat([]);
    const mail = renderBriefing('HEBDO', RoleLibelle.DAF, 'Mariam', {
      ventes: { ...ventes, horizon: 'SEMAINE', periodeLabel: 'semaine 2026-W35' },
      stocks: { valeurStock: 1_000_000, ruptures: 2, sousSeuil: 4 },
      finance: {
        initiee: { n: 1, montant: 10_000 },
        enTransit: { n: 1, montant: 20_000 },
        receptionnee: { n: 0, montant: 0 },
        valideePeriode: { n: 3, montant: 80_000 },
        litige: { n: 0, montant: 0 },
        versementsEnRetard: 1,
      },
      gl,
      liens,
    });
    expect(mail.objet).toMatch(/exécutif financier — semaine/i);
    expect(mail.html).toContain('Classement des magasins');
    expect(mail.html).toContain('CA magasin');
    expect(mail.html).toContain('Trésorerie magasin');
  });
});

describe('échantillons de test', () => {
  it('couvre les 9 modèles (briefings + alertes fonds)', () => {
    const pieces = echantillonsIllustration();
    expect(pieces.map((p: { type: string }) => p.type).sort()).toEqual(
      [
        'CLOTURE_CAISSE',
        'DIGEST_FONDS_DAF',
        'HEBDO',
        'MOIS',
        'POINT_JOUR_NON_VERSE',
        'RECEPTION_DAF_EN_ATTENTE',
        'RELANCE_CONNEXION',
        'SHOP_INACTIF',
        'SOIR',
      ].sort(),
    );
    expect(pieces.every((p: { mail: { objet: string } }) => p.mail.objet.startsWith('[TEST]'))).toBe(
      true,
    );
  });
});
