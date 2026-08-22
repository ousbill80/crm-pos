import { expect, test } from '@playwright/test';
import { DEMO_PASSWORD, loginAs } from './helpers';

const API = process.env.VITE_API_URL ?? 'http://localhost:3000';

test.describe.configure({ mode: 'serial' });

test('Achats/Fournisseurs : cycle complet fournisseur → commande → réception → facture → paiement (§6.5 module Achats)', async ({
  page,
  request,
}) => {
  const suffix = Date.now();
  const nomFournisseur = `E2E Fournisseur ${suffix}`;
  let fournisseurId = '';
  let commandeId = '';
  let factureId = '';

  await loginAs(page, request, 'demo-respsi', '/fournisseurs');

  await test.step('création fournisseur', async () => {
    await page.getByRole('button', { name: 'Nouveau fournisseur' }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau fournisseur' });
    await expect(dialog).toBeVisible();
    await dialog.locator('#fourn-nom').fill(nomFournisseur);
    await dialog.locator('#fourn-contact').fill('Contact E2E');
    await dialog.locator('#fourn-tel').fill('+221770000000');
    await dialog.getByRole('button', { name: 'Créer' }).click();
    await page.waitForURL(/\/fournisseurs\/[^/]+$/);
    fournisseurId = page.url().split('/fournisseurs/')[1];
    expect(fournisseurId).toBeTruthy();
    await expect(page.getByRole('heading', { name: nomFournisseur })).toBeVisible();
  });

  await test.step('création du bon de commande (brouillon)', async () => {
    await page.getByRole('link', { name: 'Nouvelle commande' }).click();
    await page.waitForURL(/\/achats\/commandes\?/);
    const dialog = page.getByRole('dialog', { name: 'Nouveau bon de commande' });
    await expect(dialog).toBeVisible();

    const recherche = dialog.locator('#bc-recherche');
    await recherche.fill('Chargeur USB-C 20W');
    const resultat = page
      .locator('.entity-finder-item')
      .filter({ hasNotText: /^Créer/ })
      .filter({ hasText: 'Chargeur USB-C 20W' })
      .first();
    await expect(resultat).toBeVisible();
    await resultat.click();

    await dialog
      .getByLabel(/^Quantité Chargeur USB-C 20W$/)
      .fill('10');
    await dialog
      .getByLabel(/^Prix d.achat Chargeur USB-C 20W$/)
      .fill('2500');

    await dialog.getByRole('button', { name: 'Enregistrer le brouillon' }).click();
    await page.waitForURL(/\/achats\/commandes\/[^/?]+$/);
    commandeId = page.url().split('/achats/commandes/')[1].split('?')[0];
    expect(commandeId).toBeTruthy();
    await expect(page.locator('.client-workspace-chips')).toContainText('Brouillon');
  });

  await test.step('transition interdite : réception refusée tant que la commande est en brouillon', async () => {
    const token = await page.evaluate(() => localStorage.getItem('caisse-crm.accessToken'));
    expect(token).toBeTruthy();

    const commandeApi = await request.get(`${API}/achats/commandes/${commandeId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect(commandeApi.ok(), await commandeApi.text()).toBeTruthy();
    const commandeData = (await commandeApi.json()) as {
      lignes: Array<{ id: string; produitId: string }>;
    };
    const ligneId = commandeData.lignes[0].id;
    const produitId = commandeData.lignes[0].produitId;

    const receptionIllegale = await request.post(
      `${API}/fournisseurs/${fournisseurId}/receptions`,
      {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          produitId,
          quantite: 1,
          prixAchat: 2500,
          ligneCommandeId: ligneId,
        },
      },
    );
    expect(receptionIllegale.status()).toBe(400);
    const body = (await receptionIllegale.json()) as { message: string | string[] };
    const message = Array.isArray(body.message) ? body.message.join(' ') : body.message;
    expect(message).toMatch(/BROUILLON/);
  });

  await test.step('confirmation du bon de commande', async () => {
    await page.getByRole('button', { name: 'Confirmer' }).click();
    await expect(page.locator('.client-workspace-chips')).toContainText('Confirmée');
  });

  await test.step('réception partielle', async () => {
    await page.getByRole('button', { name: /^Lignes/ }).click();
    const row = page.locator('tbody tr', { hasText: 'Chargeur USB-C 20W' });
    await row.getByRole('button', { name: 'Réceptionner' }).click();

    const dialog = page.getByRole('dialog', { name: 'Réception sur commande' });
    await expect(dialog).toBeVisible();
    await dialog.locator('#recept-qty').fill('4');
    await dialog.locator('#recept-prix').fill('2500');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.locator('.client-workspace-chips')).toContainText('Réception partielle');
    await expect(row).toContainText('4');
    await expect(row).toContainText('6');
  });

  await test.step('réception du reste', async () => {
    const row = page.locator('tbody tr', { hasText: 'Chargeur USB-C 20W' });
    await row.getByRole('button', { name: 'Réceptionner' }).click();
    const dialog = page.getByRole('dialog', { name: 'Réception sur commande' });
    await expect(dialog).toBeVisible();
    await expect(dialog.locator('#recept-qty')).toHaveValue('6');
    await dialog.locator('#recept-prix').fill('2500');
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.locator('.client-workspace-chips')).toContainText('Réceptionnée');
  });

  await test.step('clôture de la commande', async () => {
    await page.getByRole('button', { name: 'Clôturer' }).click();
    await expect(page.locator('.client-workspace-chips')).toContainText('Clôturée');
  });

  await test.step('création de la facture fournisseur à partir des réceptions', async () => {
    await page.getByRole('link', { name: 'Facturer' }).click();
    await page.waitForURL(/\/achats\/factures\?/);
    const dialog = page.getByRole('dialog', { name: 'Nouvelle facture' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Tout sélectionner').check();
    await dialog.locator('#ff-ref').fill(`BLF-${suffix}`);
    await dialog.getByRole('button', { name: /^Créer le brouillon/ }).click();
    await page.waitForURL(/\/achats\/factures\/[^/?]+$/);
    factureId = page.url().split('/achats/factures/')[1].split('?')[0];
    expect(factureId).toBeTruthy();
    await expect(page.locator('.client-workspace-chips')).toContainText('Brouillon');
  });

  await test.step('comptabilisation de la facture (SI/DAF/DG)', async () => {
    await page.getByRole('button', { name: 'Comptabiliser (DAF)' }).click();
    await expect(page.locator('.client-workspace-chips')).toContainText('Comptabilisée');
  });

  await test.step('paiement par le Caissier Central (vérifie l’accès module Achats du rôle CAISSIER_CENTRAL)', async () => {
    await loginAs(page, request, 'demo-central', `/achats/factures/${factureId}`);
    await expect(page).toHaveURL(new RegExp(`/achats/factures/${factureId}$`));
    await expect(page.locator('.client-workspace-chips')).toContainText('Comptabilisée');

    await page
      .getByRole('button', { name: 'Enregistrer un paiement', exact: true })
      .click();
    const dialog = page.getByRole('dialog', { name: 'Enregistrer un paiement' });
    await expect(dialog).toBeVisible();
    await dialog.locator('#pay-mode').selectOption('VIREMENT');
    await dialog.locator('#pay-ref').fill(`VIR-${suffix}`);
    await dialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialog).toHaveCount(0);

    await expect(page.locator('.client-workspace-chips')).toContainText('Payée');
  });

  await test.step('persistance après rechargement', async () => {
    await page.reload();
    await expect(page.locator('.client-workspace-chips')).toContainText('Payée');
  });

  await test.step('RBAC : un rôle non habilité ne peut pas payer une facture fournisseur (rejet serveur explicite)', async () => {
    const loginRespGsm = await request.post(`${API}/auth/login`, {
      data: { login: 'demo-resp-gsm', password: DEMO_PASSWORD },
    });
    expect(loginRespGsm.ok(), await loginRespGsm.text()).toBeTruthy();
    const { accessToken } = (await loginRespGsm.json()) as { accessToken: string };

    const paiementInterdit = await request.post(
      `${API}/achats/factures/${factureId}/paiements`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { montant: 1, mode: 'ESPECES' },
      },
    );
    expect(paiementInterdit.status()).toBe(403);
  });
});
