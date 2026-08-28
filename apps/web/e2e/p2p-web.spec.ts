import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test.describe('P2P back-office web', () => {
  test('Responsable Achats accède au planning et voit les états réels', async ({ page, request }) => {
    await loginAs(page, request, 'demo-achats', '/achats/planning');
    await expect(page.getByRole('heading', { name: 'Planning & sourcing achats' })).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Cycle procure-to-pay' })).toBeVisible();
    await expect(page.getByText(/Chargement des demandes|Demandes d’achat|Aucune demande/).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvelle demande' })).toBeVisible();
    await page.getByRole('button', { name: 'Nouvelle demande' }).click();
    await expect(page.getByRole('combobox', { name: 'Centre de coût' })).toBeVisible();
    await expect(page.getByRole('combobox', { name: 'Budget actif' })).toBeVisible();
  });

  test('Logistique accède aux réceptions sans action qualité', async ({ page, request }) => {
    await loginAs(page, request, 'demo-logistique', '/achats/receptions');
    await expect(page.getByRole('heading', { name: 'Réceptions & qualité' })).toBeVisible();
    await expect(page.getByText(/Chargement des réceptions|Réceptions ·|Aucune réception/).first()).toBeVisible();
  });

  test('RAF accède à la comptabilité et à la comptabilité intelligente', async ({ page, request }) => {
    await loginAs(page, request, 'demo-raf', '/finance/comptabilite');
    await expect(page.getByRole('heading', { name: 'Comptabilité', exact: true })).toBeVisible();
    const menusCompta = page.getByRole('navigation', { name: 'Menus Comptabilité' });
    await expect(menusCompta.getByRole('button', { name: 'Saisie' })).toBeVisible();
    await expect(menusCompta.getByRole('button', { name: 'Tiers' })).toBeVisible();
    await expect(menusCompta.getByRole('button', { name: 'Rapports' })).toBeVisible();
    await expect(menusCompta.getByRole('button', { name: 'Paramètres' })).toBeVisible();
    await menusCompta.getByRole('button', { name: 'Saisie' }).click();
    await expect(page.getByRole('menuitem', { name: 'Journaux' })).toBeVisible();
    await menusCompta.getByRole('button', { name: 'Saisie' }).click();
    await expect(page.getByRole('note')).toContainText(/pièce d’achat/i);
    await expect(page.locator('.compta-report .lead')).toContainText(/· \d{2}\/\d{2}\/\d{4}/, {
      timeout: 20_000,
    });
    await page.locator('summary', { hasText: 'Pièces' }).click();
    await expect(page.getByRole('menuitem', { name: /Factures d’achat/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Journal des ventes/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Journal de caisse/ })).toBeVisible();
    await expect(page.getByRole('menuitem', { name: /Journal des OD/ })).toBeVisible();
    await page.locator('summary', { hasText: 'Pièces' }).click();
    await page.getByRole('button', { name: 'Journaux' }).click();
    await expect(page.getByRole('heading', { name: 'Journaux comptables' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Achats' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Banque' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Caisse' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Ventes' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Opérations diverses' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouveau journal' })).toBeVisible();
    await page.getByRole('button', { name: 'Balance', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Balance générale' })).toBeVisible();
    await expect(page.getByRole('columnheader', { name: /Classe 4/ })).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Plan de comptes' }).click();
    await expect(page.getByRole('heading', { name: 'Plan de comptes' })).toBeVisible();
    await expect(page.getByText(/Plan SYSCOHADA opérationnel/)).toBeVisible();
    await page.getByRole('button', { name: 'Âgée 411' }).click();
    await expect(page.getByRole('heading', { name: 'Balance âgée clients (411)' })).toBeVisible();
    await page.getByRole('button', { name: 'Âgée 401' }).click();
    await expect(page.getByRole('heading', { name: 'Balance âgée fournisseurs (401)' })).toBeVisible();
    await page.getByRole('button', { name: 'Lettrage' }).click();
    await expect(page.getByRole('heading', { name: /Lettrage 401/ })).toBeVisible();
    await page.getByRole('button', { name: 'Paiements' }).click();
    await expect(page.getByRole('heading', { name: 'Propositions de paiement' })).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Préparer une proposition', exact: true }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Balance', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Applications' })).toBeVisible();
    await page.getByRole('button', { name: 'Applications' }).click();
    await expect(page.getByRole('dialog', { name: 'Applications' }).getByText('Comptabilité', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Applications' }).click();
    await page.getByRole('link', { name: 'Comptabilité intelligente' }).first().click();
    await expect(page).toHaveURL(/\/finance\/accounting-ai$/);
    await expect(page.getByRole('heading', { name: 'Comptabilité intelligente' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Nouvelle politique' })).toBeVisible();
    await page.getByRole('button', { name: 'Nouvelle politique' }).click();
    await expect(page.getByLabel('Mot de passe actuel')).toBeVisible();
  });

  test('DAF ouvre le journal des ventes depuis Pièces puis les factures d’achat', async ({ page, request }) => {
    await loginAs(page, request, 'demo-daf', '/finance/comptabilite');
    await expect(page.locator('.compta-report .lead')).toContainText(/· \d{2}\/\d{2}\/\d{4}/, {
      timeout: 20_000,
    });
    await page.locator('summary', { hasText: 'Pièces' }).click();
    const ventes = page.getByRole('menuitem', { name: /Journal des ventes/ });
    await expect(ventes).toContainText(/ · /);
    await ventes.click();
    await expect(page).toHaveURL(/rapport=grand-livre/);
    await expect(page).toHaveURL(/journal=/);
    await expect(page.getByRole('navigation', { name: 'Filtrer le grand livre par journal' })).toBeVisible();
    await page.locator('summary', { hasText: 'Pièces' }).click();
    await page.getByRole('menuitem', { name: /Factures d’achat/ }).click();
    await expect(page).toHaveURL(/\/achats\/factures/);
    await expect(page.getByRole('heading', { name: 'Factures fournisseur' })).toBeVisible();
  });

  test('DAF voit la ré-authentification avant approbation paiement', async ({ page, request }) => {
    await loginAs(page, request, 'demo-daf', '/finance/comptabilite');
    await page.getByRole('button', { name: 'Paiements' }).click();
    await page.getByRole('button', { name: 'Approuver (DAF)', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Approuver une proposition' });
    await expect(dialog.getByRole('combobox')).toBeVisible();
    await expect(dialog.getByLabel('Mot de passe actuel')).toBeVisible();
    await expect(dialog.getByText(/une seule fois/)).toBeVisible();
  });

  test('Qualité ne dérive pas vers les écrans comptables', async ({ page, request }) => {
    await loginAs(page, request, 'demo-qualite', '/finance/comptabilite');
    await expect(page).not.toHaveURL(/\/finance\/comptabilite$/);
  });
});
