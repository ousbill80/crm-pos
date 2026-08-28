import { describe, expect, it } from 'vitest';
import {
  filterVisibleMenus,
  leafMenus,
  locationMatchesMenu,
  menuOrChildActive,
  type AppMenu,
} from './odoo-menus';

const saisie: AppMenu = {
  to: '/finance/comptabilite?rapport=journaux',
  label: 'Saisie',
  children: [
    { to: '/finance/comptabilite?rapport=journaux', label: 'Journaux' },
    { to: '/finance/comptabilite?rapport=od', label: 'Opérations diverses' },
  ],
};

const parametres: AppMenu = {
  to: '/finance/comptabilite?rapport=plan-comptes',
  label: 'Paramètres',
  children: [
    { to: '/finance/comptabilite?rapport=plan-comptes', label: 'Plan de comptes' },
    { to: '/finance/accounting-ai', label: 'Comptabilité intelligente' },
  ],
};

const ventesLeaves = ['/ventes', '/ventes/tickets', '/ventes/devis', '/ventes/factures', '/pos'];
const crmLeaves = ['/clients', '/clients/pilotage', '/clients/fidelite', '/campagnes'];

describe('leafMenus', () => {
  it('aplatit uniquement les feuilles', () => {
    expect(leafMenus([saisie, { to: '/alertes', label: 'Alertes' }]).map((m) => m.label)).toEqual([
      'Journaux',
      'Opérations diverses',
      'Alertes',
    ]);
  });
});

describe('filterVisibleMenus', () => {
  it('masque un groupe dont tous les enfants sont refusés', () => {
    const visible = filterVisibleMenus([saisie, parametres], (menu) =>
      menu.to.includes('accounting-ai'),
    );
    expect(visible.map((m) => m.label)).toEqual(['Comptabilité intelligente']);
  });

  it('remonte un groupe réduit à un seul enfant', () => {
    const visible = filterVisibleMenus([saisie], (menu) => menu.to.includes('rapport=od'));
    expect(visible).toEqual([{ to: '/finance/comptabilite?rapport=od', label: 'Opérations diverses' }]);
  });
});

describe('locationMatchesMenu', () => {
  it('active Balance quand rapport est absent (défaut page compta)', () => {
    expect(
      locationMatchesMenu('/finance/comptabilite?rapport=balance', {
        pathname: '/finance/comptabilite',
        search: '',
      }),
    ).toBe(true);
    expect(
      locationMatchesMenu('/finance/comptabilite?rapport=journaux', {
        pathname: '/finance/comptabilite',
        search: '',
      }),
    ).toBe(false);
  });

  it('aligne plan-comptes et plan', () => {
    expect(
      locationMatchesMenu('/finance/comptabilite?rapport=plan-comptes', {
        pathname: '/finance/comptabilite',
        search: '?rapport=plan',
      }),
    ).toBe(true);
  });

  it('ne mélange pas les rapports', () => {
    expect(
      locationMatchesMenu('/finance/comptabilite?rapport=od', {
        pathname: '/finance/comptabilite',
        search: '?rapport=charges',
      }),
    ).toBe(false);
  });

  it('ne laisse pas Vue d’ensemble Ventes active sur le journal des tickets', () => {
    expect(
      locationMatchesMenu(
        '/ventes',
        { pathname: '/ventes/tickets', search: '' },
        ventesLeaves,
      ),
    ).toBe(false);
    expect(
      locationMatchesMenu(
        '/ventes/tickets',
        { pathname: '/ventes/tickets', search: '' },
        ventesLeaves,
      ),
    ).toBe(true);
  });

  it('garde Clients actif sur une fiche, pas sur Pilotage', () => {
    expect(
      locationMatchesMenu('/clients', { pathname: '/clients/fiche-1', search: '' }, crmLeaves),
    ).toBe(true);
    expect(
      locationMatchesMenu('/clients', { pathname: '/clients/pilotage', search: '' }, crmLeaves),
    ).toBe(false);
    expect(
      locationMatchesMenu(
        '/clients/pilotage',
        { pathname: '/clients/pilotage', search: '' },
        crmLeaves,
      ),
    ).toBe(true);
  });

  it('ne marque pas Vue DAF quand un onglet Finance est ouvert', () => {
    expect(
      locationMatchesMenu('/finance', { pathname: '/finance', search: '?tab=resultat' }),
    ).toBe(false);
    expect(
      locationMatchesMenu('/finance?tab=resultat', {
        pathname: '/finance',
        search: '?tab=resultat',
      }),
    ).toBe(true);
  });
});

describe('menuOrChildActive', () => {
  it('marque le groupe parent quand un enfant est ouvert', () => {
    expect(
      menuOrChildActive(parametres, {
        pathname: '/finance/accounting-ai',
        search: '',
      }),
    ).toBe(true);
    expect(
      menuOrChildActive(saisie, {
        pathname: '/finance/accounting-ai',
        search: '',
      }),
    ).toBe(false);
  });
});
