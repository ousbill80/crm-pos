import { expect, test, type Page } from '@playwright/test';

// Cycle CRUD Produits/Stocks (§6.5 modèle de données, grand livre append-only
// pour les mouvements de stock — cf. CLAUDE.md « Grand livre append-only »).
// Couvre : création/édition produit (doublon référence rejeté), ajustement
// libre (SI/DG), transfert immédiat entre entrepôts, circuit journalisé des
// bons de stock (BROUILLON → PRÊT → FAIT, le stock ne bouge qu'au FAIT),
// inventaire physique avec séparation des tâches serveur (comptage ≠
// validation), et persistance de tous les mouvements dans le journal.
//
// Note de périmètre : ImportCatalogueModal (import CSV/Excel par upload de
// fichier) n'est PAS couvert ici — wizard multi-étapes avec upload binaire,
// hors périmètre de ce passage (nécessiterait une fixture de fichier dédiée).
// EntrepotDetailPage et MouvementStockDetailPage sont des pages de lecture
// seule (pas de formulaire CRUD) : non testées ici pour la même raison que
// ProfilsPage dans admin.spec.ts.

const API = process.env.VITE_API_URL ?? 'http://localhost:3000';
const DEMO_PASSWORD = 'MotDePasse!123';

test.describe.configure({ mode: 'serial' });

const tokenCache = new Map<
  string,
  Promise<{ accessToken: string; mustChangePassword: boolean }>
>();

/**
 * Le throttle anti-brute-force (§6.7, 5 req/60s) est un guard serveur
 * partagé par IP : lorsque d'autres suites e2e tournent en parallèle contre
 * le même serveur de dev, une requête peut recevoir un 429 transitoire qui
 * n'a rien à voir avec le comportement testé ici. On retente avec un léger
 * backoff plutôt que d'échouer le test sur un artefact d'environnement.
 */
async function loginSansThrottle(login: string, password: string) {
  for (let tentative = 0; ; tentative += 1) {
    const res = await fetch(`${API}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login, password }),
    });
    if (res.status === 429 && tentative < 20) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    if (!res.ok) throw new Error(`login ${login} -> ${res.status} ${await res.text()}`);
    return res.json() as Promise<{ accessToken: string; mustChangePassword: boolean }>;
  }
}

async function tokenFor(login: string, password = DEMO_PASSWORD) {
  const key = `${login}:${password}`;
  let pending = tokenCache.get(key);
  if (!pending) {
    pending = loginSansThrottle(login, password);
    tokenCache.set(key, pending);
  }
  return pending;
}

/**
 * Le throttle global (§6.7, guard applicatif partagé par IP) s'applique à
 * toutes les routes, pas seulement /auth/login. En environnement de dev
 * partagé avec d'autres suites e2e concurrentes, on peut recevoir un 429
 * transitoire sur n'importe quel appel : on retente (jamais sur un vrai
 * statut métier comme 400/403/409, uniquement sur 429) plutôt que de
 * confondre un artefact d'environnement avec un échec fonctionnel.
 */
async function apiAs(login: string, path: string, init?: RequestInit): Promise<Response> {
  const { accessToken } = await tokenFor(login);
  for (let tentative = 0; ; tentative += 1) {
    const res = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
        ...init?.headers,
      },
    });
    if (res.status === 429 && tentative < 20) {
      await new Promise((r) => setTimeout(r, 3000));
      continue;
    }
    return res;
  }
}

/** Ouvre `path` déjà authentifié via injection du token en localStorage. */
async function gotoAs(page: Page, login: string, path: string) {
  const { accessToken } = await tokenFor(login);
  await page.addInitScript((token: string) => {
    localStorage.setItem('caisse-crm.accessToken', token);
  }, accessToken);
  await page.goto(path);
}

interface EntrepotLite {
  entrepotId: string;
  code: string;
  quantite: number;
}

async function quantitesProduit(login: string, produitId: string): Promise<EntrepotLite[]> {
  const res = await apiAs(login, '/stocks/synthese');
  const raw = await res.text();
  expect(res.ok, raw).toBeTruthy();
  const body = JSON.parse(raw) as {
    lignes: Array<{
      produitId: string;
      parEntrepot: Array<{ entrepotId: string; code: string; quantite: number }>;
    }>;
  };
  const ligne = body.lignes.find((l) => l.produitId === produitId);
  if (!ligne) return [];
  return ligne.parEntrepot.map((e) => ({
    entrepotId: e.entrepotId,
    code: e.code,
    quantite: e.quantite,
  }));
}

async function quantiteSur(login: string, produitId: string, entrepotId: string): Promise<number> {
  const lignes = await quantitesProduit(login, produitId);
  return lignes.find((e) => e.entrepotId === entrepotId)?.quantite ?? 0;
}

test.describe('Produits & Stocks — cycle CRUD complet (§6.5)', () => {
  // Sous charge (autres suites e2e tournant en parallèle contre le même
  // serveur de dev), le retry du throttle de /auth/login peut à lui seul
  // consommer jusqu'à ~60s : on donne de la marge pour ne pas confondre un
  // timeout d'environnement avec un vrai échec fonctionnel.
  test.setTimeout(120_000);

  const suffixe = Date.now();
  const designation = `E2E Produit ${suffixe}`;
  const reference = `E2E-${suffixe}`;

  let produitId: string;
  let entrepotA: string; // entrepôt recevant le stock initial (déterminé par le serveur)
  let entrepotB: string; // second entrepôt réseau, choisi dynamiquement pour le transfert
  let bonId: string;
  let sessionInventaireId: string;

  test('création d’un produit par le Responsable SI (stock initial déposé via le grand livre)', async ({
    page,
  }) => {
    await gotoAs(page, 'demo-respsi', '/produits');
    await expect(page.getByRole('heading', { name: 'Produits' })).toBeVisible();

    await page.getByRole('button', { name: 'Nouveau produit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau produit' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Désignation').fill(designation);
    await dialog.getByLabel('Référence / SKU (optionnel, unique)').fill(reference);
    await dialog.getByLabel('Prix unitaire (FCFA)').fill('1500');
    await dialog.getByLabel('Stock initial (déposé sur l’entrepôt PRINCIPAL)').fill('5');

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/produits') && r.request().method() === 'POST',
      ),
      dialog.getByRole('button', { name: 'Créer' }).click(),
    ]);
    const rawCreated = await response.text();
    expect(response.ok(), rawCreated).toBeTruthy();
    const created = JSON.parse(rawCreated) as { id: string };
    produitId = created.id;

    await page.waitForURL(new RegExp(`/produits/${produitId}$`));
    await expect(page.getByRole('heading', { name: designation })).toBeVisible();
    await expect(page.getByText('Stock réseau').first()).toBeVisible();

    // Le stock initial a été appliqué comme mouvement AJUSTEMENT du grand
    // livre (jamais une écriture directe de solde) — on retrouve l'entrepôt
    // exact via l'API plutôt que de le deviner.
    const lignes = await quantitesProduit('demo-respsi', produitId);
    const avecStock = lignes.filter((e) => e.quantite === 5);
    expect(avecStock.length, JSON.stringify(lignes)).toBe(1);
    entrepotA = avecStock[0].entrepotId;

    // Second entrepôt réseau pour les tests de transfert : n'importe quel
    // entrepôt actif de type stock différent de entrepotA.
    const entrepotsRes = await apiAs('demo-respsi', '/entrepots');
    expect(entrepotsRes.ok).toBeTruthy();
    const entrepots = (await entrepotsRes.json()) as Array<{
      id: string;
      usage: string | null;
      virtuel: boolean;
      code: string;
    }>;
    const candidat = entrepots.find(
      (e) => e.id !== entrepotA && (e.usage ?? 'STOCK') === 'STOCK' && !e.virtuel,
    );
    expect(candidat, JSON.stringify(entrepots)).toBeTruthy();
    entrepotB = candidat!.id;
  });

  test('la création d’un produit avec une référence déjà utilisée est rejetée (409)', async ({
    page,
  }) => {
    await gotoAs(page, 'demo-respsi', '/produits');
    await page.getByRole('button', { name: 'Nouveau produit' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau produit' });

    await dialog.getByLabel('Désignation').fill(`${designation} (doublon)`);
    await dialog.getByLabel('Référence / SKU (optionnel, unique)').fill(reference);
    await dialog.getByLabel('Prix unitaire (FCFA)').fill('1000');
    await dialog.getByLabel('Stock initial (déposé sur l’entrepôt PRINCIPAL)').fill('0');
    await dialog.getByRole('button', { name: 'Créer' }).click();

    await expect(
      dialog.getByText('Cette référence est déjà attribuée à un autre produit.'),
    ).toBeVisible();
    // Le formulaire reste ouvert — aucune navigation, aucun second produit créé.
    await expect(dialog).toBeVisible();
  });

  test('édition de la fiche identité par le Responsable SI', async ({ page }) => {
    await gotoAs(page, 'demo-respsi', `/produits/${produitId}`);
    await page.getByRole('button', { name: 'Identité' }).click();
    await page.getByRole('button', { name: 'Modifier' }).click();

    const nouvelleDesignation = `${designation} (modifié)`;
    await page.getByLabel('Désignation').fill(nouvelleDesignation);
    await page.getByLabel('Prix unitaire (FCFA)').fill('1800');
    await page.getByRole('button', { name: 'Enregistrer' }).click();

    await expect(page.getByRole('heading', { name: nouvelleDesignation })).toBeVisible();
    await expect(page.getByText('1 800 FCFA').first()).toBeVisible();
  });

  test('un rôle boutique (CAISSIER_BOUTIQUE) reçoit un 403 explicite en tentant de créer ou modifier un produit', async () => {
    const create = await apiAs('demo-pos-caissier', '/produits', {
      method: 'POST',
      body: JSON.stringify({
        designation: 'Ne doit pas exister',
        prixUnitaire: 100,
        stock: 0,
      }),
    });
    expect(create.status).toBe(403);

    const update = await apiAs('demo-pos-caissier', `/produits/${produitId}`, {
      method: 'PATCH',
      body: JSON.stringify({ designation: 'Hack' }),
    });
    expect(update.status).toBe(403);
  });

  test('ajustement d’urgence (SI/DG) : quantité comptée 5 → 8 sur l’entrepôt d’origine', async ({
    page,
  }) => {
    await gotoAs(page, 'demo-respsi', '/stocks');
    await expect(page.getByRole('heading', { name: 'Stocks' })).toBeVisible();

    await page.getByRole('button', { name: 'Ajuster' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ajustement d’urgence (SI / Direction)' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Produit').selectOption(produitId);
    await dialog.getByLabel('Entrepôt').selectOption(entrepotA);
    await dialog.getByLabel('Quantité comptée').fill('8');
    await dialog.getByLabel('Motif / référence (optionnel)').fill(`e2e-ajustement-${suffixe}`);

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/stocks/ajustements') && r.request().method() === 'POST',
      ),
      dialog.getByRole('button', { name: 'Enregistrer l’ajustement' }).click(),
    ]);
    expect(response.ok(), await response.text()).toBeTruthy();

    await expect(dialog).toBeHidden();
    expect(await quantiteSur('demo-respsi', produitId, entrepotA)).toBe(8);
  });

  test('un rôle boutique (RESPONSABLE_BOUTIQUE) reçoit un 403 explicite sur l’ajustement libre', async () => {
    const res = await apiAs('demo-resp-gsm', '/stocks/ajustements', {
      method: 'POST',
      body: JSON.stringify({
        produitId,
        entrepotId: entrepotA,
        quantiteComptee: 999,
      }),
    });
    expect(res.status).toBe(403);
    // La quantité n'a pas bougé côté serveur suite à la tentative rejetée.
    expect(await quantiteSur('demo-respsi', produitId, entrepotA)).toBe(8);
  });

  test('transfert immédiat entre entrepôts : 2 unités entrepôt A → entrepôt B', async ({
    page,
  }) => {
    await gotoAs(page, 'demo-respsi', '/stocks');
    await page.getByRole('button', { name: 'Transférer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Transférer entre entrepôts' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Produit').selectOption(produitId);
    await dialog.getByLabel('Source').selectOption(entrepotA);
    await dialog.getByLabel('Destination').selectOption(entrepotB);
    await dialog.getByLabel('Quantité').fill('2');

    const [response] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/stocks/transferts') && r.request().method() === 'POST',
      ),
      dialog.getByRole('button', { name: 'Confirmer le transfert' }).click(),
    ]);
    expect(response.ok(), await response.text()).toBeTruthy();

    await expect(dialog).toBeHidden();
    expect(await quantiteSur('demo-respsi', produitId, entrepotA)).toBe(6);
    expect(await quantiteSur('demo-respsi', produitId, entrepotB)).toBe(2);
  });

  test('un transfert dont la quantité dépasse le disponible est bloqué côté formulaire', async ({
    page,
  }) => {
    await gotoAs(page, 'demo-respsi', '/stocks');
    await page.getByRole('button', { name: 'Transférer' }).click();
    const dialog = page.getByRole('dialog', { name: 'Transférer entre entrepôts' });

    await dialog.getByLabel('Produit').selectOption(produitId);
    await dialog.getByLabel('Source').selectOption(entrepotA);
    await dialog.getByLabel('Destination').selectOption(entrepotB);
    await dialog.getByLabel('Quantité').fill('999');

    await expect(dialog.getByText('Quantité supérieure au disponible.')).toBeVisible();
    await expect(
      dialog.getByRole('button', { name: 'Confirmer le transfert' }),
    ).toBeDisabled();

    // Le serveur rejette également un appel direct qui bypasserait l’UI.
    const res = await apiAs('demo-respsi', '/stocks/transferts', {
      method: 'POST',
      body: JSON.stringify({
        produitId,
        entrepotSourceId: entrepotA,
        entrepotDestId: entrepotB,
        quantite: 999,
      }),
    });
    expect(res.status).toBe(400);
    expect(await quantiteSur('demo-respsi', produitId, entrepotA)).toBe(6);
  });

  test('bon de stock (transfert interne) : le stock ne bouge qu’au statut Fait (BROUILLON → PRÊT → FAIT)', async ({
    page,
  }) => {
    await gotoAs(page, 'demo-respsi', '/stocks/operations');
    await expect(page.getByRole('heading', { name: 'Opérations de stock' })).toBeVisible();

    await page.getByRole('button', { name: 'Nouveau bon' }).click();
    const dialog = page.getByRole('dialog', { name: 'Nouveau bon de stock' });
    await expect(dialog).toBeVisible();

    await dialog.getByLabel('Type').selectOption('TRANSFERT_INTERNE');
    await dialog.getByLabel('Source').selectOption(entrepotA);
    await dialog.getByLabel('Destination').selectOption(entrepotB);
    await dialog.locator('label', { hasText: 'Produit' }).getByRole('combobox').selectOption(produitId);
    await dialog.getByLabel('Quantité').fill('1');

    const [createRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/stocks/bons') && r.request().method() === 'POST',
      ),
      dialog.getByRole('button', { name: 'Créer le brouillon' }).click(),
    ]);
    const rawBon = await createRes.text();
    expect(createRes.ok(), rawBon).toBeTruthy();
    const bon = JSON.parse(rawBon) as { id: string; statut: string };
    bonId = bon.id;
    expect(bon.statut).toBe('BROUILLON');

    await page.waitForURL(new RegExp(`/stocks/operations/${bonId}$`));
    // Un brouillon ne déplace jamais le stock vendable.
    expect(await quantiteSur('demo-respsi', produitId, entrepotA)).toBe(6);
    expect(await quantiteSur('demo-respsi', produitId, entrepotB)).toBe(2);

    await page.getByRole('button', { name: 'Mettre en prêt' }).click();
    await expect(page.locator('span.badge', { hasText: 'Prêt' })).toBeVisible();
    // Toujours aucun mouvement au statut PRÊT.
    expect(await quantiteSur('demo-respsi', produitId, entrepotA)).toBe(6);
    expect(await quantiteSur('demo-respsi', produitId, entrepotB)).toBe(2);

    page.once('dialog', (dialog) => void dialog.accept());
    await page.getByRole('button', { name: 'Valider (Fait)' }).click();
    await expect(page.locator('span.badge', { hasText: 'Fait' })).toBeVisible();
    // Le stock bouge uniquement à la validation Fait.
    expect(await quantiteSur('demo-respsi', produitId, entrepotA)).toBe(5);
    expect(await quantiteSur('demo-respsi', produitId, entrepotB)).toBe(3);
  });

  test('un rôle non pilote (RESPONSABLE_BOUTIQUE) reçoit un 403 explicite en tentant de créer un bon de stock', async () => {
    const res = await apiAs('demo-resp-gsm', '/stocks/bons', {
      method: 'POST',
      body: JSON.stringify({
        type: 'TRANSFERT_INTERNE',
        entrepotSourceId: entrepotA,
        entrepotDestId: entrepotB,
        lignes: [{ produitId, quantite: 1 }],
      }),
    });
    expect(res.status).toBe(403);
  });

  test('inventaire physique : ouverture, comptage avec écart, séparation des tâches serveur, validation par un tiers', async ({
    page,
    browser,
  }) => {
    // 1) Le Responsable SI ouvre un inventaire sur l’entrepôt A (initiateur = comptage).
    await gotoAs(page, 'demo-respsi', '/inventaires');
    await page.getByRole('button', { name: 'Nouvel inventaire' }).click();
    const dialog = page.getByRole('dialog', { name: 'Ouvrir un inventaire' });
    await expect(dialog).toBeVisible();
    await dialog.getByLabel('Entrepôt').selectOption(entrepotA);

    const [ouvrirRes] = await Promise.all([
      page.waitForResponse(
        (r) => r.url().endsWith('/inventaires') && r.request().method() === 'POST',
      ),
      dialog.getByRole('button', { name: 'Figer le théorique et compter' }).click(),
    ]);
    const rawSession = await ouvrirRes.text();
    expect(ouvrirRes.ok(), rawSession).toBeTruthy();
    const session = JSON.parse(rawSession) as { id: string };
    sessionInventaireId = session.id;
    await page.waitForURL(new RegExp(`/inventaires/${sessionInventaireId}$`));

    // 2) Comptage volontairement en écart (5 théorique → 4 compté).
    await page.getByLabel('Recherche').fill(reference);
    const ligne = page.locator('tr', { hasText: reference });
    await expect(ligne).toBeVisible();
    await expect(ligne.locator('td').nth(1)).toHaveText('5');
    await ligne.getByRole('spinbutton').fill('4');
    await ligne.getByRole('button', { name: 'OK' }).click();
    await expect(ligne.getByText('-1')).toBeVisible();

    // 3) Reporte le théorique pour toutes les autres lignes de l’entrepôt.
    const reporterBtn = page.getByRole('button', { name: 'Reporter le théorique restant' });
    if (await reporterBtn.isEnabled()) {
      await reporterBtn.click();
    }
    await expect(page.getByText(/^1$/).first()).toBeVisible(); // KPI Écarts = 1

    // 4) Séparation des tâches : l’initiateur ne voit pas le bouton de
    // validation et le serveur refuse explicitement s’il tente quand même.
    await expect(
      page.getByRole('button', { name: 'Valider et ajuster le stock' }),
    ).toHaveCount(0);
    await expect(page.getByText('Séparation des tâches')).toBeVisible();

    const validationInterdite = await apiAs(
      'demo-respsi',
      `/inventaires/${sessionInventaireId}/valider`,
      { method: 'POST' },
    );
    expect(validationInterdite.status).toBe(403);
    const corpsInterdit = await validationInterdite.text();
    expect(corpsInterdit).toContain('Séparation des tâches');

    // 5) Un second utilisateur habilité (Direction Générale, distinct de
    // l’initiateur) valide dans un contexte navigateur isolé.
    const contexteDg = await browser.newContext();
    const pageDg = await contexteDg.newPage();
    await gotoAs(pageDg, 'demo-dg', `/inventaires/${sessionInventaireId}`);
    const validerBtn = pageDg.getByRole('button', { name: 'Valider et ajuster le stock' });
    await expect(validerBtn).toBeVisible();
    await expect(validerBtn).toBeEnabled();

    const [validerRes] = await Promise.all([
      pageDg.waitForResponse(
        (r) =>
          r.url().endsWith(`/inventaires/${sessionInventaireId}/valider`) &&
          r.request().method() === 'POST',
      ),
      validerBtn.click(),
    ]);
    expect(validerRes.ok(), await validerRes.text()).toBeTruthy();
    await expect(pageDg.getByText('Validé', { exact: true })).toBeVisible();
    await contexteDg.close();

    // 6) L’écart est appliqué comme une écriture de grand livre (AJUSTEMENT),
    // jamais comme une simple édition de solde.
    expect(await quantiteSur('demo-respsi', produitId, entrepotA)).toBe(4);

    const mvtsRes = await apiAs('demo-respsi', `/stocks/mouvements?entrepotId=${entrepotA}`);
    const mouvements = (await mvtsRes.json()) as Array<{
      produitId: string;
      type: string;
      quantite: number;
      stockApres: number;
      reference: string | null;
    }>;
    const mvtInventaire = mouvements.find(
      (m) => m.produitId === produitId && m.type === 'AJUSTEMENT' && m.stockApres === 4,
    );
    expect(mvtInventaire, JSON.stringify(mouvements.slice(0, 5))).toBeTruthy();
  });

  test('persistance après reload : fiche produit, stocks et bon reflètent l’état final', async ({
    page,
  }) => {
    await gotoAs(page, 'demo-respsi', `/produits/${produitId}`);
    await page.reload();
    await expect(page.getByText('Stock réseau').first()).toBeVisible();
    // Réseau = entrepotA (4, après inventaire) + entrepotB (3, après bon Fait) = 7.
    await expect(page.getByText('7', { exact: true }).first()).toBeVisible();

    await gotoAs(page, 'demo-respsi', `/stocks/operations/${bonId}`);
    await page.reload();
    await expect(page.locator('span.badge', { hasText: 'Fait' })).toBeVisible();
  });
});
