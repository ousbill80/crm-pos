import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

// Impression d'étiquettes code-barres en lot depuis le Catalogue (dynamique,
// intelligent et structuré — cf. plan approuvé, cahier des charges silencieux
// sur ce point, clarifié avec l'utilisateur : support rouleau/A4 au choix,
// champs optionnels, sélection multiple + quantité, génération auto d'un
// code interne pour tout produit sans EAN sans jamais écraser un code
// existant). Couvre : flux complet DAF (sélection -> impression PDF ->
// génération auto persistée + auditée), et séparation des tâches serveur
// (un rôle boutique sans écriture catalogue n'a ni le bouton, ni l'accès API).

const API = process.env.VITE_API_URL ?? 'http://localhost:3000';
const DEMO_PASSWORD = 'MotDePasse!123';

test.describe.configure({ mode: 'serial' });

// Le throttle anti-brute-force (§6.7, 5 req/60s, partagé par IP) peut
// répondre 429 sur un run e2e qui enchaîne plusieurs logins rapprochés —
// même pattern de retry avec backoff que stocks.spec.ts, et mise en cache
// du token par utilisateur pour ne pas relancer un login déjà obtenu.
const tokenCache = new Map<string, Promise<string>>();

async function loginSansThrottle(login: string): Promise<string> {
  for (let tentative = 0; ; tentative += 1) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password: DEMO_PASSWORD }),
    });
    if (res.status === 429 && tentative < 20) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) throw new Error(`login ${login} -> ${res.status} ${await res.text()}`);
    const { accessToken } = (await res.json()) as { accessToken: string };
    return accessToken;
  }
}

async function tokenPour(login: string): Promise<string> {
  let pending = tokenCache.get(login);
  if (!pending) {
    pending = loginSansThrottle(login);
    tokenCache.set(login, pending);
  }
  return pending;
}

test.describe('Impression étiquettes catalogue — flux lot + RBAC', () => {
  const suffixe = Date.now();
  const designation = `E2E Etiquette ${suffixe}`;

  let produitId: string;

  test('DAF crée un produit sans code-barres puis imprime un lot en Planche A4', async ({
    page,
    request,
  }) => {
    const tokenDaf = await tokenPour('demo-daf');
    const creation = await request.post(`${API}/produits`, {
      headers: { Authorization: `Bearer ${tokenDaf}` },
      data: { designation, prixUnitaire: 2500, stock: 10 },
    });
    expect(creation.ok()).toBeTruthy();
    const produitCree = (await creation.json()) as {
      id: string;
      codeBarres: string | null;
    };
    produitId = produitCree.id;
    expect(produitCree.codeBarres).toBeNull();

    await loginAs(page, request, 'demo-daf', '/produits');

    await page.getByLabel('Rechercher').fill(designation);
    const row = page.locator('tr', { hasText: designation });
    await expect(row).toBeVisible();

    await page.getByRole('button', { name: 'Sélection pour étiquettes' }).click();
    await row.getByRole('checkbox', { name: `Sélectionner ${designation}` }).click();

    await expect(page.getByText('1 article(s) sélectionné(s)')).toBeVisible();
    await page.getByRole('button', { name: 'Imprimer les étiquettes' }).click();

    const modal = page.getByRole('dialog', { name: 'Imprimer les étiquettes' });
    await expect(modal).toBeVisible();
    const ligneModal = modal.locator('tr', { hasText: designation });
    await ligneModal.getByRole('spinbutton').fill('3');
    await modal.getByRole('radio', { name: /Planche A4/ }).check();
    await modal.getByRole('checkbox', { name: /Référence interne/ }).check();

    const downloadPromise = page.waitForEvent('download');
    await modal.getByRole('button', { name: 'Imprimer les étiquettes' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('etiquettes-produits.pdf');

    const relu = await request.get(`${API}/produits/${produitId}`, {
      headers: { Authorization: `Bearer ${tokenDaf}` },
    });
    const produitApres = (await relu.json()) as {
      codeBarres: string | null;
      codeBarresGenere: boolean;
    };
    expect(produitApres.codeBarres).not.toBeNull();
    expect(produitApres.codeBarresGenere).toBe(true);
  });

  test('DAF imprime depuis la fiche produit', async ({ page, request }) => {
    await loginAs(page, request, 'demo-daf', `/produits/${produitId}`);
    await expect(page.getByRole('heading', { name: designation })).toBeVisible();

    const hero = page.locator('header.client-workspace-hero');
    await hero.getByRole('button', { name: /Imprimer l.étiquette/ }).click();

    const modal = page.getByRole('dialog', { name: 'Imprimer les étiquettes' });
    await expect(modal).toBeVisible();
    await expect(modal.getByText('2 500 FCFA')).toBeVisible();
    await expect(modal.getByText(/2\s*\/\s*000/)).toHaveCount(0);

    const downloadPromise = page.waitForEvent('download');
    await modal.getByRole('button', { name: 'Imprimer les étiquettes' }).click();
    const download = await downloadPromise;
    expect(download.suggestedFilename()).toBe('etiquettes-produits.pdf');
  });

  test('Caissier boutique (hors écriture catalogue) : ni bouton, ni accès API direct', async ({
    page,
    request,
  }) => {
    await loginAs(page, request, 'demo-caissier-gsm', '/produits');

    await expect(
      page.getByRole('button', { name: 'Sélection pour étiquettes' }),
    ).toHaveCount(0);
    await expect(
      page.getByRole('button', { name: /Imprimer l.étiquette/ }),
    ).toHaveCount(0);

    const tokenCaissier = await tokenPour('demo-caissier-gsm');
    const tentative = await request.post(`${API}/produits/etiquettes/pdf`, {
      headers: { Authorization: `Bearer ${tokenCaissier}` },
      data: {
        articles: [{ produitId, quantite: 1 }],
        format: 'PLANCHE_A4',
        afficherNom: true,
        afficherBoutique: false,
        afficherReference: false,
      },
    });
    expect(tentative.status()).toBe(403);
  });
});
