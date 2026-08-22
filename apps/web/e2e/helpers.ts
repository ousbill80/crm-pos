import { expect, type Page } from '@playwright/test';

export const DEMO_CAISSIER = 'demo-pos-caissier';
export const DEMO_TEMOIN = 'demo-pos-temoin';
export const DEMO_PASSWORD = 'MotDePasse!123';
export const SKU_STOCK = 'COQ-IP-SIL';

export async function loginPos(page: Page): Promise<void> {
  await page.goto('/login');
  await page.getByTestId('login-identifiant').fill(DEMO_CAISSIER);
  await page.getByTestId('login-password').fill(DEMO_PASSWORD);
  await page.getByTestId('login-submit').click();
  await page.waitForURL(/\/pos/);
}

const API = process.env.VITE_API_URL ?? 'http://localhost:3000';

/**
 * Connexion rapide par injection de token (comme loginPos) mais pour
 * n'importe quel compte démo — évite de repasser par le formulaire de
 * login pour chaque spec hors POS.
 */
export async function loginAs(
  page: Page,
  request: import('@playwright/test').APIRequestContext,
  login: string,
  gotoPath = '/',
): Promise<void> {
  const res = await request.post(`${API}/auth/login`, {
    data: { login, password: DEMO_PASSWORD },
  });
  if (!res.ok()) {
    throw new Error(`Login démo échoué pour ${login}: ${await res.text()}`);
  }
  const { accessToken } = (await res.json()) as { accessToken: string };
  await page.addInitScript((token: string) => {
    localStorage.setItem('caisse-crm.accessToken', token);
  }, accessToken);
  await page.goto(gotoPath);
}

export async function ouvrirPosteSiBesoin(page: Page): Promise<void> {
  const openForm = page.getByTestId('pos-open');
  const shell = page.getByTestId('pos-shell');
  await expect(openForm.or(shell)).toBeVisible();
  if (await shell.isVisible()) return;

  await page.getByTestId('pos-open-submit').click();
  const temoin = page.getByTestId(`pos-temoin-${DEMO_TEMOIN}`);
  if (await temoin.isVisible()) {
    await temoin.click();
  }
  await page.getByTestId('pos-temoin-password').fill(DEMO_PASSWORD);
  await page.getByTestId('pos-open-submit').click();
  await expect(shell).toBeVisible();
}

export async function abandonnerFileSiPresente(page: Page): Promise<void> {
  const fileBtn = page.getByTestId('pos-file-btn');
  if (!(await fileBtn.isVisible())) return;
  if ((await fileBtn.locator('.pos-topbar-count').count()) === 0) return;

  await fileBtn.click();
  const dialog = page.getByTestId('pos-file-dialog');
  await expect(dialog).toBeVisible();

  let remaining = await dialog.locator('[data-testid^="pos-file-abandon-"]').count();
  while (remaining > 0) {
    await dialog.locator('[data-testid^="pos-file-abandon-"]').first().click();
    await page.getByTestId('pos-confirm-ok').click();
    remaining -= 1;
    if (remaining > 0 && (await dialog.count()) === 0) {
      await fileBtn.click();
      await expect(page.getByTestId('pos-file-dialog')).toBeVisible();
    }
  }

  const stillOpen = page.getByTestId('pos-file-dialog');
  if (await stillOpen.isVisible()) {
    await stillOpen.getByLabel('Fermer').click();
  }
}

export async function ajouterArticleEnStock(page: Page): Promise<void> {
  const search = page.getByTestId('pos-search-input');
  await search.fill(SKU_STOCK);
  const tile = page.getByTestId(`pos-tile-${SKU_STOCK}`);
  await expect(tile).toBeVisible();
  await tile.click();
}
