import { expect, test } from '@playwright/test';
import {
  abandonnerFileSiPresente,
  ajouterArticleEnStock,
  DEMO_CAISSIER,
  DEMO_PASSWORD,
  ouvrirPosteSiBesoin,
} from './helpers';

const API = process.env.VITE_API_URL ?? 'http://localhost:3000';

test.describe.configure({ mode: 'serial' });

test('POS : file serveur, mixte, clôture bloquée (§6.7 / encaissement)', async ({
  page,
  request,
}) => {
  const login = await request.post(`${API}/auth/login`, {
    data: { login: DEMO_CAISSIER, password: DEMO_PASSWORD },
  });
  expect(login.ok(), await login.text()).toBeTruthy();
  const { accessToken } = (await login.json()) as { accessToken: string };
  await page.addInitScript((token: string) => {
    localStorage.setItem('caisse-crm.accessToken', token);
  }, accessToken);

  await page.goto('/pos');
  await ouvrirPosteSiBesoin(page);
  await abandonnerFileSiPresente(page);

  await test.step('park → refresh → reprise', async () => {
    await ajouterArticleEnStock(page);
    await page.getByTestId('pos-park-btn').click();
    await expect(page.getByTestId('pos-park-dialog')).toBeVisible();
    await page.getByTestId('pos-park-print').uncheck();
    const libelle = `E2E ${Date.now()}`;
    await page.locator('#park-libelle').fill(libelle);
    await page.getByTestId('pos-park-confirm').click();
    await expect(page.getByTestId('pos-park-dialog')).toHaveCount(0);
    await expect(page.getByTestId('pos-cloture-btn')).toBeDisabled();

    await page.reload();
    await ouvrirPosteSiBesoin(page);
    await page.getByTestId('pos-file-btn').click();
    const file = page.getByTestId('pos-file-dialog');
    await expect(file).toBeVisible();
    await file.locator('.pos-file-card', { hasText: libelle }).first().click();
    await expect(page.getByTestId('pos-go-pay')).toBeEnabled();
    await expect(page.getByText(/Coque silicone/i).first()).toBeVisible();

    await page.getByTestId('pos-clear-btn').click();
    await page.getByTestId('pos-confirm-ok').click();
  });

  await test.step('paiement mixte espèces + carte', async () => {
    await ajouterArticleEnStock(page);
    await page.getByTestId('pos-go-pay').click();
    await page.getByTestId('pos-pay-mode-CARTE').click();
    await page.locator('#part-ESPECES').fill('1000');
    await page.locator('#part-CARTE').fill('1500');
    await page.getByTestId('pos-cash-exact').click();
    await page.getByTestId('pos-pay-validate').click();
    await expect(page.getByTestId('pos-receipt')).toBeVisible();
    const parts = page.getByTestId('pos-receipt-paiements');
    await expect(parts).toContainText(/Espèces/i);
    await expect(parts).toContainText(/Carte/i);
    await page.getByRole('button', { name: 'Nouvelle commande' }).click();
    await expect(page.getByTestId('pos-shell')).toBeVisible();
  });

  await test.step('clôture bloquée tant que la file n’est pas vide', async () => {
    await ajouterArticleEnStock(page);
    await page.getByTestId('pos-park-btn').click();
    await page.getByTestId('pos-park-print').uncheck();
    await page.getByTestId('pos-park-confirm').click();
    const cloture = page.getByTestId('pos-cloture-btn');
    await expect(cloture).toBeDisabled();

    await page.getByTestId('pos-file-btn').click();
    await expect(page.getByTestId('pos-file-dialog')).toBeVisible();
    await page.locator('[data-testid^="pos-file-abandon-"]').first().click();
    await page.getByTestId('pos-confirm-ok').click();
    await expect(cloture).toBeEnabled();
  });
});
