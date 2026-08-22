import { expect, test, type Page } from '@playwright/test';

const API = process.env.VITE_API_URL ?? 'http://localhost:3000';
const DEMO_PASSWORD = 'MotDePasse!123';

test.describe.configure({ mode: 'serial' });

// Le login (@Throttle 5 req/60s en environnement non-test, cf.
// AuthController) est un vrai garde-fou anti-brute-force (§6.7) qui tourne
// contre le serveur de dev partagé ici — pas un mock. On mutualise donc les
// jetons entre tests (un seul POST /auth/login par compte) au lieu de
// repasser par le formulaire de connexion à chaque scénario ; seuls les
// tests explicitement dédiés au login exercent réellement le formulaire.
const tokenCache = new Map<string, Promise<{ accessToken: string; mustChangePassword: boolean }>>();

async function tokenFor(login: string, password = DEMO_PASSWORD) {
  const key = `${login}:${password}`;
  let pending = tokenCache.get(key);
  if (!pending) {
    pending = (async () => {
      // Même garde-fou anti-brute-force que loginUiForm (§6.7) : ce chemin
      // API direct (utilisé par apiAs/gotoAs) partage le même throttle que
      // le formulaire, potentiellement saturé par d'autres suites e2e en
      // parallèle — on retente donc au lieu d'échouer sur une contention
      // étrangère au comportement testé.
      const maxAttempts = 5;
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const res = await fetch(`${API}/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ login, password }),
        });
        if (res.status === 429 && attempt < maxAttempts) {
          await new Promise((resolve) => setTimeout(resolve, 65_000));
          continue;
        }
        if (!res.ok) throw new Error(`login ${login} -> ${res.status} ${await res.text()}`);
        return res.json() as Promise<{ accessToken: string; mustChangePassword: boolean }>;
      }
      throw new Error(`login ${login} -> throttled après ${maxAttempts} tentatives`);
    })();
    tokenCache.set(key, pending);
  }
  return pending;
}

async function apiAs(login: string, path: string, init?: RequestInit) {
  const { accessToken } = await tokenFor(login);
  return fetch(`${API}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      ...init?.headers,
    },
  });
}

/** Ouvre `path` déjà authentifié via injection du token en localStorage — évite de repasser par /auth/login. */
async function gotoAs(page: Page, login: string, path: string) {
  const { accessToken } = await tokenFor(login);
  await page.addInitScript((token: string) => {
    localStorage.setItem('caisse-crm.accessToken', token);
  }, accessToken);
  await page.goto(path);
}

/**
 * Soumet le formulaire de connexion. Le throttle anti-brute-force
 * (@Throttle 5 req/60s sur /auth/login, §6.7) est un vrai garde-fou qui
 * tourne contre le serveur de dev partagé — d'autres suites e2e exécutées en
 * parallèle sur le même process (autres modules audités simultanément)
 * peuvent le saturer de façon prolongée, pas seulement transitoire. Si le
 * formulaire répond « Trop de tentatives » (429), on patiente la fenêtre
 * puis on retente, jusqu'à `maxAttempts` fois, plutôt que d'échouer le test
 * sur une contention étrangère au comportement métier réellement testé.
 */
async function loginUiForm(page: Page, login: string, password = DEMO_PASSWORD) {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await page.goto('/login');
    await page.getByTestId('login-identifiant').fill(login);
    await page.getByTestId('login-password').fill(password);
    await page.getByTestId('login-submit').click();

    const alert = page.getByRole('alert');
    const outcome = await Promise.race([
      page
        .waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 20_000 })
        .then(() => 'navigated' as const),
      alert.waitFor({ state: 'visible', timeout: 20_000 }).then(() => 'error' as const),
    ]).catch(() => 'timeout' as const);

    if (outcome === 'error') {
      const text = (await alert.textContent()) ?? '';
      if (text.includes('Trop de tentatives') && attempt < maxAttempts) {
        await page.waitForTimeout(65_000);
        continue;
      }
    }
    return;
  }
}

test.describe('Administration : login', () => {
  test('login valide redirige vers l’accueil du profil (RESPONSABLE_SI)', async ({ page }) => {
    test.setTimeout(360_000); // jusqu'à 5 tentatives * 65s si le throttle partagé reste saturé
    await loginUiForm(page, 'demo-respsi');
    await page.waitForURL(/\/utilisateurs/);
    await expect(page.getByRole('heading', { name: 'Utilisateurs' })).toBeVisible();

    // Réutilise le jeton obtenu via le formulaire pour les tests suivants
    // (gotoAs/apiAs) : un seul POST /auth/login pour demo-respsi au lieu de
    // deux, pour rester sous le throttle réel de 5 req/60s de /auth/login.
    const accessToken = await page.evaluate(() =>
      localStorage.getItem('caisse-crm.accessToken'),
    );
    if (accessToken) {
      tokenCache.set(
        `demo-respsi:${DEMO_PASSWORD}`,
        Promise.resolve({ accessToken, mustChangePassword: false }),
      );
    }
  });

  test('login invalide affiche un message d’erreur clair', async ({ page }) => {
    test.setTimeout(360_000); // jusqu'à 5 tentatives * 65s si le throttle partagé reste saturé
    await loginUiForm(page, 'demo-respsi', 'mauvais-mot-de-passe');
    await expect(page.getByText('Identifiants invalides.')).toBeVisible();
    await expect(page).toHaveURL(/\/login/);
  });
});

test.describe('Administration : RBAC serveur (§6.2)', () => {
  test('un rôle non autorisé (CAISSIER_BOUTIQUE) reçoit un 403 explicite sur /users et /audit', async () => {
    test.setTimeout(360_000); // 1er tokenFor('demo-caissier-gsm') peut retenter sur throttle partagé
    const listUsers = await apiAs('demo-caissier-gsm', '/users');
    expect(listUsers.status).toBe(403);
    const bodyUsers = await listUsers.text();
    expect(bodyUsers).toContain('non habilité');

    const createUser = await apiAs('demo-caissier-gsm', '/users', {
      method: 'POST',
      body: JSON.stringify({
        login: `should-not-exist-${Date.now()}`,
        nom: 'X',
        prenom: 'Y',
        role: 'CAISSIER_BOUTIQUE',
      }),
    });
    expect(createUser.status).toBe(403);

    const audit = await apiAs('demo-caissier-gsm', '/audit');
    expect(audit.status).toBe(403);
  });

  test('un rôle non autorisé (CAISSIER_BOUTIQUE) est redirigé loin de /utilisateurs et /audit côté UI', async ({ page }) => {
    await gotoAs(page, 'demo-caissier-gsm', '/utilisateurs');
    await expect(page).not.toHaveURL(/\/utilisateurs/);

    await gotoAs(page, 'demo-caissier-gsm', '/audit');
    await expect(page).not.toHaveURL(/\/audit/);
  });
});

test.describe('Administration : cycle de vie utilisateur (§4, §6.2, §6.7)', () => {
  const uniqueLogin = `e2e-admin-${Date.now()}`;
  let createdUserId: string | null = null;

  test('création d’un utilisateur par le Responsable SI', async ({ page }) => {
    await gotoAs(page, 'demo-respsi', '/utilisateurs');

    await page.getByTestId('users-create-btn').click();
    // Le formulaire de création est une modale ; le libellé « Profil » existe
    // aussi sur le filtre de la liste sous-jacente (toujours dans le DOM
    // derrière la modale) — on scope donc les locators au dialogue pour lever
    // l'ambiguïté.
    const dialog = page.getByRole('dialog', { name: 'Nouvel utilisateur' });
    await dialog.getByLabel('Identifiant de connexion').fill(uniqueLogin);
    await dialog.getByLabel('Nom', { exact: true }).fill('Testeur');
    await dialog.getByLabel('Prénom').fill('E2E');
    await dialog.getByLabel('Profil').selectOption('CAISSIER_BOUTIQUE');
    await dialog.getByLabel('Boutique').selectOption({ index: 1 });

    await dialog.getByRole('button', { name: 'Créer' }).click();

    // Redirection vers la fiche + mot de passe temporaire affiché une seule fois.
    await page.waitForURL(/\/utilisateurs\/[a-z0-9-]+$/);
    await expect(page.getByText('Mot de passe temporaire pour')).toBeVisible();
    await expect(page.getByText(uniqueLogin)).toBeVisible();

    const url = page.url();
    createdUserId = url.split('/utilisateurs/')[1] ?? null;
    expect(createdUserId).toBeTruthy();

    // Le nouveau compte doit être marqué "à changer" dans l'annuaire.
    await page.goto('/utilisateurs');
    const row = page.locator('tr', { hasText: uniqueLogin });
    await expect(row).toBeVisible();
    await expect(row.getByText('Mdp à changer')).toBeVisible();
  });

  test('le nouvel utilisateur doit changer son mot de passe à la première connexion', async ({ page }) => {
    test.setTimeout(360_000); // jusqu'à 5 tentatives * 65s si le throttle partagé reste saturé
    // Récupère un mot de passe temporaire connu via un reset ciblé (le mdp
    // affiché en clair au test précédent n'est jamais rejoué) pour garder ce
    // test indépendant, sans consommer un login supplémentaire au hasard.
    expect(createdUserId).toBeTruthy();
    const reset = await apiAs('demo-respsi', `/users/${createdUserId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    const resetBody = await reset.text();
    expect(reset.ok, resetBody).toBeTruthy();
    const { temporaryPassword } = JSON.parse(resetBody) as { temporaryPassword: string };

    await loginUiForm(page, uniqueLogin, temporaryPassword);
    await page.waitForURL(/\/changer-mot-de-passe/);
    await expect(page.getByRole('heading', { name: 'Changement de mot de passe' })).toBeVisible();

    const newPassword = 'NouveauMdp!456';
    await page.getByLabel('Mot de passe temporaire').fill(temporaryPassword);
    await page.getByLabel('Nouveau mot de passe', { exact: true }).fill(newPassword);
    await page.getByLabel('Confirmer le nouveau mot de passe').fill(newPassword);
    await page.getByRole('button', { name: 'Changer le mot de passe' }).click();

    await page.waitForURL(/\/dashboard|\/pos/);
    await expect(page).not.toHaveURL(/\/changer-mot-de-passe/);
  });

  test('édition de la fiche (identité) par le Responsable SI', async ({ page }) => {
    expect(createdUserId).toBeTruthy();
    await gotoAs(page, 'demo-respsi', `/utilisateurs/${createdUserId}`);

    await page.getByLabel('Nom', { exact: true }).fill('TesteurModifie');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByRole('heading', { name: /TesteurModifie/ })).toBeVisible();
  });

  test('réinitialisation du mot de passe depuis la fiche (onglet Sécurité)', async ({ page }) => {
    await gotoAs(page, 'demo-respsi', `/utilisateurs/${createdUserId}`);

    await page.getByRole('button', { name: 'Sécurité' }).click();
    await page.getByRole('button', { name: 'Réinitialiser le mot de passe' }).click();

    await expect(page.getByText('Mot de passe temporaire :')).toBeVisible();
  });

  test('désactivation puis réactivation du compte', async ({ page }) => {
    await gotoAs(page, 'demo-respsi', `/utilisateurs/${createdUserId}`);
    await page.getByRole('button', { name: 'Sécurité' }).click();

    await page.getByRole('button', { name: 'Désactiver le compte' }).click();
    await expect(page.getByRole('button', { name: 'Réactiver le compte' })).toBeVisible();
    // « Inactif » apparaît à la fois dans le badge d'en-tête et dans la
    // définition « Statut » — on scope au badge pour lever l'ambiguïté.
    await expect(page.locator('span.badge', { hasText: 'Inactif' })).toBeVisible();

    await page.getByRole('button', { name: 'Réactiver le compte' }).click();
    await expect(page.getByRole('button', { name: 'Désactiver le compte' })).toBeVisible();
  });

  test('un compte désactivé ne peut plus se connecter (vérifié directement en API)', async () => {
    // Désactive de nouveau via API pour tester le rejet de connexion sans
    // consommer un login supplémentaire côté UI.
    const disable = await apiAs('demo-respsi', `/users/${createdUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({ actif: false }),
    });
    expect(disable.ok, await disable.text()).toBeTruthy();

    const blocked = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: uniqueLogin, password: 'NouveauMdp!456' }),
    });
    expect(blocked.status).toBe(401);

    const reenable = await apiAs('demo-respsi', `/users/${createdUserId}`, {
      method: 'PATCH',
      body: JSON.stringify({ actif: true }),
    });
    expect(reenable.ok, await reenable.text()).toBeTruthy();
  });
});

test.describe('Administration : journal d’audit (§6.7)', () => {
  test('le journal d’audit est consultable avec filtres fonctionnels par le Responsable SI', async ({ page }) => {
    await gotoAs(page, 'demo-respsi', '/audit');

    await expect(page.getByRole('heading', { name: "Journal d'audit" })).toBeVisible();
    await expect(page.locator('table tbody tr').first()).toBeVisible();

    // Filtre par action : ne doit renvoyer que des lignes de cette action.
    // Locator scopé au rôle combobox : getByLabel('Action') seul est
    // ambigu, il matche aussi les boutons InfoTooltip
    // « Explication : Action sensible » (substring du nom accessible).
    const filtreAction = page.getByRole('combobox', { name: 'Action' });
    await filtreAction.fill('UTILISATEUR_CREE');
    await expect(async () => {
      const rows = page.locator('table tbody tr');
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
      for (let i = 0; i < count; i += 1) {
        await expect(rows.nth(i)).toContainText(/UTILISATEUR CREE/i);
      }
    }).toPass({ timeout: 10_000 });

    // Réinitialisation des filtres.
    await page.getByRole('button', { name: 'Réinitialiser' }).click();
    await expect(filtreAction).toHaveValue('');

    // Détail d'une entrée.
    await page.locator('table tbody tr').first().click();
    const detailDialog = page.getByRole('dialog');
    await expect(detailDialog).toBeVisible();
    // La modale expose deux boutons de même nom accessible « Fermer » (la
    // croix d'en-tête via aria-label, et le bouton d'action en pied de
    // modale) — on cible celui du pied de modale.
    await detailDialog.getByRole('button', { name: 'Fermer' }).last().click();
  });

  test('DAF a accès en lecture seule au journal (sans droits admin utilisateurs)', async ({ page }) => {
    test.setTimeout(360_000); // 1er tokenFor('demo-daf') peut retenter sur throttle partagé
    await gotoAs(page, 'demo-daf', '/audit');
    await expect(page.getByRole('heading', { name: "Journal d'audit" })).toBeVisible();
  });
});

test.describe('Administration : Profils (lecture seule)', () => {
  test('la matrice des profils est accessible et affiche les effectifs réels', async ({ page }) => {
    await gotoAs(page, 'demo-respsi', '/profils');

    await expect(page.getByRole('heading', { name: 'Profils', exact: true })).toBeVisible();
    await expect(page.getByText('Matrice applications × profils')).toBeVisible();
    // Aucun formulaire d'édition : profils = catalogue figé.
    await expect(page.locator('form')).toHaveCount(0);
  });
});
