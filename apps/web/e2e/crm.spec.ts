import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

test.describe.configure({ mode: 'serial' });

const ts = Date.now();
const NOM_PHY = `E2E${ts}Phy`;
const PRENOM_PHY = 'Awa';
const CONTACT_PHY_1 = `+225070000${String(ts).slice(-4)}`;
const CONTACT_PHY_2 = `contact-${ts}@e2e.test`;
const NOM_MORALE = `E2E${ts} SARL`;
const CAMPAGNE_NOM = `E2E Campagne ${ts}`;

test('CRM/Devis : clients, fidélité, interactions, campagnes, devis (§6.6)', async ({
  page,
  request,
}) => {
  const erreursConsole: string[] = [];
  page.on('pageerror', (err) => erreursConsole.push(String(err)));

  await loginAs(page, request, 'demo-crm', '/clients');
  await expect(page.getByRole('heading', { name: 'Clients' })).toBeVisible();

  await test.step('KPI Clients — filtre VIP au clic', async () => {
    await page.locator('.crm-kpi-widget').filter({ hasText: 'VIP' }).click();
    await expect(page.locator('#filtre-segment')).toHaveValue('VIP');
    await page.locator('.crm-kpi-widget').filter({ hasText: 'Résultats' }).click();
    await expect(page.locator('#filtre-segment')).toHaveValue('');
  });

  let clientPhysiqueId = '';

  await test.step('Créer un client — personne physique', async () => {
    await page
      .locator('.page-header-actions')
      .getByRole('button', { name: 'Nouveau client' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau client' });
    await expect(dialog).toBeVisible();

    await dialog.locator('#client-prenom').fill(PRENOM_PHY);
    await dialog.locator('#client-nom').fill(NOM_PHY);
    await dialog.locator('#client-contact').fill(CONTACT_PHY_1);
    await dialog.locator('#client-naissance').fill('1990-05-20');
    await dialog.locator('#client-consentement').check();

    await dialog.getByRole('button', { name: 'Créer le client' }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByLabel('Recherche').fill(NOM_PHY);
    const row = page.locator('tr.client-row', { hasText: NOM_PHY });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(PRENOM_PHY);

    await row.click();
    await page.waitForURL(/\/clients\/[a-f0-9-]+$/);
    clientPhysiqueId = page.url().split('/clients/')[1];
    await expect(
      page.getByRole('heading', { name: `${PRENOM_PHY} ${NOM_PHY}` }),
    ).toBeVisible();
  });

  await test.step('Éditer la fiche — persistance après reload', async () => {
    await page
      .locator('.client-workspace-toolbar-actions')
      .getByRole('button', { name: /Modifier/ })
      .click();

    const form = page.locator('form.client-fiche-form');
    await expect(form).toBeVisible();
    await form.locator('#edit-contact').fill(CONTACT_PHY_2);
    await form.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(form).toHaveCount(0);

    await expect(page.getByText(CONTACT_PHY_2).first()).toBeVisible();

    await page.reload();
    await expect(page.getByText(CONTACT_PHY_2).first()).toBeVisible();
  });

  await test.step('Créditer des points de fidélité — cas invalide puis valide', async () => {
    await page
      .getByLabel('Sections fiche client')
      .getByRole('button', { name: 'Fidélité', exact: true })
      .click();
    const creditForm = page.locator('form.client-fidelite-credit');
    await expect(creditForm).toBeVisible();

    // Cas invalide : 0 point → message d'erreur clair, pas de crash.
    await creditForm.locator('#pts').fill('0');
    await creditForm.getByRole('button', { name: 'Créditer' }).click();
    await expect(creditForm.getByRole('alert')).toHaveText(
      'Indiquez un nombre de points entier ≥ 1.',
    );

    // Cas valide.
    const pointsAvant = await page
      .locator('.client-fidelite-points-value')
      .innerText();
    await creditForm.locator('#pts').fill('50');
    await creditForm.locator('#motif').fill('Geste commercial E2E');
    await creditForm.getByRole('button', { name: 'Créditer' }).click();
    await expect(creditForm.getByRole('alert')).toHaveCount(0);
    await expect(async () => {
      const pointsApres = await page
        .locator('.client-fidelite-points-value')
        .innerText();
      expect(Number(pointsApres)).toBe(Number(pointsAvant) + 50);
    }).toPass();
  });

  await test.step('Créer une interaction depuis la fiche client', async () => {
    await page.getByRole('button', { name: /^Interactions/ }).click();
    const form = page.locator('form.client-interactions-form');
    await expect(form).toBeVisible();
    await form.getByRole('button', { name: 'SAV' }).click();
    await form.getByRole('button', { name: 'Appel' }).click();
    const contenu = `Compte-rendu E2E ${ts}`;
    await form.locator('#inter-contenu').fill(contenu);
    await form
      .getByRole('button', { name: 'Enregistrer l’interaction' })
      .click();

    const timeline = page.locator('.client-interactions-timeline');
    await expect(timeline).toContainText(contenu);
    await expect(timeline).toContainText('SAV');
    await expect(timeline).toContainText('Appel');
  });

  await test.step('Journal réseau des interactions (CrmInteractionsPage)', async () => {
    await page.goto('/clients/interactions');
    await expect(
      page.getByRole('heading', { name: 'Interactions CRM' }),
    ).toBeVisible();
    await page.getByLabel('Client').fill(NOM_PHY);
    await expect(page.locator('.clients-table-wrap tbody tr')).toHaveCount(1, {
      timeout: 15_000,
    });
    await expect(page.locator('.clients-table-wrap tbody tr').first()).toContainText(
      PRENOM_PHY,
    );
  });

  await test.step('Recalculer le segment (CrmSegmentationPage)', async () => {
    await page.goto('/clients/segmentation');
    await expect(page.getByRole('heading', { name: 'Segmentation' })).toBeVisible();
    const row = page.locator('tr', { hasText: NOM_PHY });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: 'Recalculer' }).click();
    await expect(row.getByRole('button', { name: 'Recalculer' })).toBeEnabled();
  });

  await test.step('Paramètres CRM — round-trip sans régression des seuils', async () => {
    await page.goto('/clients/parametres');
    await expect(page.getByRole('heading', { name: 'Paramètres CRM' })).toBeVisible();
    const form = page.locator('form.client-workspace-card');
    await expect(form).toBeVisible();
    const argent = await form.locator('#seuil-argent').inputValue();
    const or = await form.locator('#seuil-or').inputValue();
    await form.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.getByRole('status')).toHaveText('Seuils enregistrés.');
    await expect(form.locator('#seuil-argent')).toHaveValue(argent);
    await expect(form.locator('#seuil-or')).toHaveValue(or);
  });

  await test.step('Fidélité / Pilotage — tableaux de bord lecture seule', async () => {
    await page.goto('/clients/fidelite');
    await expect(page.getByRole('heading', { name: 'Fidélité' })).toBeVisible();
    await expect(page.getByText('Adhérents')).toBeVisible();

    await page.goto('/clients/pilotage');
    await expect(page.getByRole('heading', { name: 'Pilotage CRM' })).toBeVisible();
    await expect(page.getByText('CA identifié', { exact: true })).toBeVisible();
  });

  await test.step('Créer un client — personne morale', async () => {
    await page.goto('/clients');
    await page
      .locator('.page-header-actions')
      .getByRole('button', { name: 'Nouveau client' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau client' });
    await expect(dialog).toBeVisible();

    await dialog
      .getByRole('button', { name: 'Personne morale' })
      .click();
    await dialog.locator('#client-raison-sociale').fill(NOM_MORALE);
    await dialog.getByRole('button', { name: 'Créer le client' }).click();
    await expect(dialog).toHaveCount(0);

    await page.getByLabel('Recherche').fill(NOM_MORALE);
    const row = page.locator('tr.client-row', { hasText: NOM_MORALE });
    await expect(row).toHaveCount(1);
    await expect(row.getByText('Morale')).toBeVisible();
  });

  await test.step('Cas invalide — création client sans champs obligatoires', async () => {
    await page.getByLabel('Recherche').fill('');
    await page
      .locator('.page-header-actions')
      .getByRole('button', { name: 'Nouveau client' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau client' });
    await expect(dialog).toBeVisible();
    // Aucun champ rempli : le bouton de soumission reste désactivé
    // (validation client bloquante — pas de requête envoyée, pas de crash).
    await expect(
      dialog.getByRole('button', { name: 'Créer le client' }),
    ).toBeDisabled();
    await dialog.getByRole('button', { name: 'Annuler' }).click();
    await expect(dialog).toHaveCount(0);
  });

  let campagneCreee = false;

  await test.step('Créer une campagne CRM et exporter les contacts ciblés', async () => {
    await page.goto('/campagnes');
    await expect(
      page.getByRole('heading', { name: 'Campagnes', exact: true }),
    ).toBeVisible();
    await page
      .locator('.page-header-actions')
      .getByRole('button', { name: 'Nouvelle campagne' })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Nouvelle campagne' });
    await expect(dialog).toBeVisible();
    await dialog.locator('#campagne-nom').fill(CAMPAGNE_NOM);
    await dialog.locator('#campagne-message').fill('Message de test E2E — offre spéciale.');
    await dialog.getByRole('button', { name: 'Créer la campagne' }).click();
    await expect(dialog).toHaveCount(0);
    campagneCreee = true;

    const item = page.locator('.campagne-item', { hasText: CAMPAGNE_NOM });
    await expect(item).toHaveCount(1);
    await item.getByRole('button', { name: 'Voir les contacts ciblés' }).click();
    await expect(item.locator('ul li').first()).toBeVisible();

    const downloadPromise = page.waitForEvent('download');
    await item.getByRole('button', { name: 'Exporter CSV' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.csv$/);
    await expect(item.getByRole('alert')).toHaveCount(0);
  });

  let devisId = '';

  await test.step('Créer un devis B2B (brouillon multi-lignes)', async () => {
    await page.goto('/ventes/devis');
    await expect(page.getByRole('heading', { name: 'Devis clients' })).toBeVisible();
    await page.getByRole('button', { name: 'Nouveau devis' }).click();

    const form = page.locator('form.form-grid').first();
    await form.locator('#devis-client-q').fill(NOM_PHY);
    await expect(form.locator('.dash-section-summary-list li')).not.toHaveCount(0);
    await form
      .locator('.dash-section-summary-list li button', { hasText: PRENOM_PHY })
      .first()
      .click();

    const ligneRow = form.locator('tbody tr').first();
    await ligneRow.locator('input').nth(0).fill('Prestation E2E');
    await ligneRow.locator('input').nth(1).fill('2');
    await ligneRow.locator('input').nth(2).fill('15000');

    const submit = form.getByRole('button', { name: 'Créer le brouillon' });
    await expect(submit).toBeEnabled();
    await submit.click();

    await page.waitForURL(/\/ventes\/devis\/[a-f0-9-]+$/);
    devisId = page.url().split('/ventes/devis/')[1];
    await expect(
      page.locator('.clients-dl').getByText('Brouillon', { exact: true }),
    ).toBeVisible();
    await expect(page.getByText('30 000 FCFA').first()).toBeVisible();
  });

  await test.step('Éditer les lignes du devis (brouillon)', async () => {
    await page.getByRole('button', { name: 'Modifier' }).click();
    const form = page.locator('form').filter({ has: page.locator('#devis-notes-edit') });
    await expect(form).toBeVisible();
    const row = form.locator('tbody tr').first();
    await row.locator('input').nth(1).fill('3');
    await form.locator('#devis-notes-edit').fill('Notes E2E mises à jour');
    await form.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(form).toHaveCount(0);
    await expect(page.getByText('45 000 FCFA').first()).toBeVisible();
    await expect(page.getByText('Notes E2E mises à jour')).toBeVisible();
  });

  await test.step('Faire progresser le workflow du devis (§ transitions)', async () => {
    await page.getByRole('button', { name: 'Envoyer' }).click();
    await expect(page.getByText('Envoyé').first()).toBeVisible();

    await page.getByRole('button', { name: 'Accepter' }).click();
    await expect(page.getByText('Accepté').first()).toBeVisible();

    await page.getByRole('button', { name: 'Marquer transformé' }).click();
    await expect(page.getByText('Transformé').first()).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Actions de workflow' }),
    ).toHaveCount(0);
  });

  await test.step('Le devis apparaît dans l’onglet Devis de la fiche client', async () => {
    await page.goto(`/clients/${clientPhysiqueId}?tab=devis`);
    const devisSection = page.locator('.client-workspace-panel');
    await expect(devisSection.getByText('Transformé')).toBeVisible();
    await devisSection.getByRole('link', { name: 'Ouvrir' }).click();
    await page.waitForURL(new RegExp(`/ventes/devis/${devisId}$`));
  });

  expect(erreursConsole, `Erreurs JS non attrapées : ${erreursConsole.join('; ')}`).toEqual(
    [],
  );
  expect(campagneCreee).toBe(true);
});
