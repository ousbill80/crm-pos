import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

// Cycle complet trésorerie §6.4 : création tiroir (CRUD caisses), initiation
// d'un versement boutique -> centrale, transitions de la machine à états
// (Initiée -> En transit -> Réceptionnée -> Validée), persistance après
// reload, et preuve que la séparation des tâches (§6.2/§6.4) est appliquée
// côté serveur — pas seulement masquée côté UI — pour un rôle boutique qui
// tente de réceptionner/valider.

const API = process.env.VITE_API_URL ?? 'http://localhost:3000';
const BOUTIQUE_NOM = 'Accessoires GSM';

test.describe.configure({ mode: 'serial' });

test.describe('Trésorerie — cycle complet §6.4', () => {
  const suffixe = Date.now();
  const codeTiroir = `E2${suffixe % 100000}`;
  const libelleTiroir = `E2E ${suffixe}`;
  const montant = 15000 + (suffixe % 900);

  let transactionId: string;

  test('DAF crée un tiroir POS pour la boutique GSM (CRUD caisses)', async ({
    page,
    request,
  }) => {
    await loginAs(page, request, 'demo-daf', '/caisses?vue=gestion');

    await page
      .getByRole('button', { name: new RegExp(BOUTIQUE_NOM) })
      .click();

    const form = page.locator('form.caisses-gestion-add');
    await expect(form).toBeVisible();
    await form.getByLabel('Code').fill(codeTiroir);
    await form.getByLabel('Libellé').fill(libelleTiroir);
    await form.getByRole('button', { name: 'Ajouter un tiroir' }).click();

    const row = page.locator('tr', { hasText: libelleTiroir });
    await expect(row).toBeVisible();
    await expect(row.locator('code')).toHaveText(codeTiroir);
    await expect(row.getByText('Actif')).toBeVisible();

    // Update : désactiver puis réactiver le tiroir fraîchement créé.
    await row.getByRole('button', { name: 'Désactiver' }).click();
    await expect(row.getByText('Inactif')).toBeVisible();
    await row.getByRole('button', { name: 'Activer' }).click();
    await expect(row.getByText('Actif')).toBeVisible();

    // Persistance après reload.
    await page.reload();
    const rowAfterReload = page.locator('tr', { hasText: libelleTiroir });
    await expect(rowAfterReload).toBeVisible();
    await expect(rowAfterReload.getByText('Actif')).toBeVisible();
  });

  test('Responsable boutique GSM initie un versement puis le passe en transit', async ({
    page,
    request,
  }) => {
    await loginAs(page, request, 'demo-resp-gsm', '/transactions');

    await page.getByRole('button', { name: 'Nouveau versement' }).first().click();
    const modal = page.getByRole('dialog', { name: 'Nouveau versement' });
    await expect(modal).toBeVisible();
    await modal.getByLabel('Montant').fill(String(montant));

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().includes('/transactions') && r.request().method() === 'POST',
      ),
      modal.getByRole('button', { name: 'Initier le versement' }).click(),
    ]);
    expect(response.ok()).toBeTruthy();
    const body = (await response.json()) as { id: string; statut: string };
    transactionId = body.id;
    expect(body.statut).toBe('INITIEE');

    await page.goto(`/transactions/${transactionId}`);
    await expect(page.locator('.badge', { hasText: 'INITIEE' })).toBeVisible();

    await page.getByRole('button', { name: 'Passer en transit' }).click();
    await expect(page.locator('.badge', { hasText: 'EN_TRANSIT' })).toBeVisible();
  });

  test('Caissier GSM (boutique) ne peut ni réceptionner ni valider — rejet explicite serveur', async ({
    page,
    request,
  }) => {
    await loginAs(page, request, 'demo-caissier-gsm', `/transactions/${transactionId}`);

    // Côté UI : aucun bouton de réceptionnement pour un rôle boutique.
    await expect(page.getByRole('button', { name: 'Réceptionner' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Rapprocher' })).toHaveCount(0);

    // Côté serveur : même en appelant directement l'endpoint (bypass UI), la
    // séparation des tâches §6.2/§6.4 doit être appliquée avec un rejet
    // explicite (403), jamais un échec silencieux.
    const loginCaissier = await request.post(`${API}/auth/login`, {
      data: { login: 'demo-caissier-gsm', password: 'MotDePasse!123' },
    });
    const { accessToken } = (await loginCaissier.json()) as { accessToken: string };

    const receptionner = await request.patch(
      `${API}/transactions/${transactionId}/receptionner`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    expect(receptionner.status()).toBe(403);

    const rapprocher = await request.patch(
      `${API}/transactions/${transactionId}/rapprocher`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        data: { montantRecu: montant },
      },
    );
    expect(rapprocher.status()).toBe(403);
  });

  test('WebSocket §5.2 — la boutique voit le changement de statut sans rechargement', async ({
    browser,
    request,
  }) => {
    const contextBoutique = await browser.newContext();
    const contextCentral = await browser.newContext();
    const pageBoutique = await contextBoutique.newPage();
    const pageCentral = await contextCentral.newPage();

    await loginAs(
      pageBoutique,
      request,
      'demo-resp-gsm',
      `/transactions/${transactionId}`,
    );
    await loginAs(
      pageCentral,
      request,
      'demo-central',
      `/transactions/${transactionId}`,
    );

    await expect(
      pageBoutique.locator('.badge', { hasText: 'EN_TRANSIT' }),
    ).toBeVisible();
    await pageCentral.getByRole('button', { name: 'Réceptionner' }).click();
    await expect(
      pageCentral.locator('.badge', { hasText: 'RECEPTIONNEE' }),
    ).toBeVisible();

    await expect(
      pageBoutique.locator('.badge', { hasText: 'RECEPTIONNEE' }),
    ).toBeVisible({ timeout: 10_000 });

    await contextBoutique.close();
    await contextCentral.close();
  });

  test('Caissier central rapproche sans écart -> VALIDEE, persistance après reload', async ({
    page,
    request,
  }) => {
    await loginAs(page, request, 'demo-central', `/transactions/${transactionId}`);

    await expect(page.locator('.badge', { hasText: 'RECEPTIONNEE' })).toBeVisible();
    await page.getByRole('button', { name: 'Rapprocher' }).click();
    const modal = page.getByRole('dialog', { name: 'Rapprochement' });
    await expect(modal).toBeVisible();
    // Le formulaire préremplit le montant reçu avec le montant déclaré :
    // aucun écart -> VALIDEE (pas de litige).
    await expect(modal.getByLabel('Montant reçu')).toHaveValue(String(montant));
    await modal.getByRole('button', { name: 'Rapprocher' }).click();

    await expect(page.locator('.badge', { hasText: 'VALIDEE' })).toBeVisible();

    await page.reload();
    await expect(page.locator('.badge', { hasText: 'VALIDEE' })).toBeVisible();
    // Une fois VALIDEE, plus aucune action de transition n'est proposée
    // (état terminal §6.4).
    await expect(page.getByRole('button', { name: 'Rapprocher' })).toHaveCount(0);
  });
});
