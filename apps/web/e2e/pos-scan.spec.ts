import { expect, test } from '@playwright/test';
import {
  abandonnerFileSiPresente,
  DEMO_CAISSIER,
  DEMO_PASSWORD,
  ouvrirPosteSiBesoin,
} from './helpers';

const API = process.env.VITE_API_URL ?? 'http://localhost:3000';
const EAN_STOCK = '3760012345670';

test('POS : scan EAN étiquette ajoute l’article, code inconnu signalé', async ({
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

  const search = page.getByTestId('pos-search-input');
  await search.fill(EAN_STOCK);
  await search.press('Enter');
  await expect(page.locator('.pos-order-lines li.is-last')).toContainText(
    /Coque/i,
  );
  await expect(page.getByTestId('pos-scan-feedback')).toContainText(/Coque/i);

  await search.fill('0000000000000');
  await search.press('Enter');
  await expect(page.getByTestId('pos-scan-feedback')).toContainText(
    /Aucun article/i,
  );

  await page.getByTestId('pos-clear-btn').click();
  await page.getByTestId('pos-confirm-ok').click();

  await page.locator('.pos-ticket-header').click();
  await page.keyboard.type(EAN_STOCK, { delay: 8 });
  await page.keyboard.press('Enter');
  await expect(page.locator('.pos-order-lines li.is-last')).toContainText(
    /Coque/i,
  );
});
