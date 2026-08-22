import { execSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { loginAs } from './helpers';

// Compte Direction Générale : admin structure complet (zones/boutiques/
// entrepôts/caisses) + lecture trésorerie (ROLES_LECTURE_CAISSES côté API),
// seul profil permettant d'exercer les 5 formulaires CRUD de /entreprise
// sans se heurter à une restriction RBAC volontaire (cf. Responsable SI,
// exclu de la lecture caisses — §4 séparation admin structure / trésorerie).
const DEMO_DG = 'demo-dg';
// Port 5433 par défaut : mappage du service postgres CI (.github/workflows/ci.yml).
// Surchargeable via E2E_DB_URL pour un run local si ce port est occupé par une
// autre instance Postgres (ex. instance de dev native sur la même machine).
const DB_URL = process.env.E2E_DB_URL ?? 'postgresql://caisse@127.0.0.1:5433/caisse_crm';

test.describe.configure({ mode: 'serial' });

test('Entreprise : CRUD société/zone/boutique/entrepôt/caisse (§6.5 structure réseau)', async ({
  page,
  request,
}) => {
  await loginAs(page, request, DEMO_DG, '/entreprise');
  await expect(page.getByTestId('cfg-nav-societe')).toBeVisible();

  const ts = Date.now();

  await test.step('Société : modifier et vérifier la persistance', async () => {
    await page.getByTestId('cfg-nav-societe').click();
    await page.getByTestId('societe-edit-toggle').click();
    const raisonSociale = page.locator('#rs');
    await expect(raisonSociale).toBeEditable();
    const nouvelleRaison = `Marché des Accessoires E2E ${ts}`;
    await raisonSociale.fill(nouvelleRaison);
    await page.getByTestId('societe-submit').click();
    await expect(page.getByTestId('societe-msg')).toBeVisible();

    await page.reload();
    await page.getByTestId('cfg-nav-societe').click();
    await expect(page.getByRole('heading', { name: new RegExp(nouvelleRaison) })).toBeVisible();
    await page.getByTestId('societe-edit-toggle').click();
    await expect(page.locator('#rs')).toHaveValue(nouvelleRaison);
  });

  const nomZone = `E2E Zone ${ts}`;
  const nomZoneModifie = `E2E Zone ${ts} modifiée`;

  await test.step('Zone : créer, vérifier, modifier, vérifier la persistance', async () => {
    await page.getByTestId('cfg-nav-zones').click();
    await page.getByTestId('zone-create-btn').click();
    await page.locator('#nz').fill(nomZone);
    await page.getByTestId('zone-create-submit').click();
    await expect(page.getByRole('dialog', { name: 'Nouvelle zone' })).toHaveCount(0);
    await expect(page.getByText(nomZone, { exact: true })).toBeVisible();

    await page.getByRole('button', { name: `Ouvrir ${nomZone}` }).click();
    await page.locator('#ze-nom').fill(nomZoneModifie);
    await page.getByTestId('zone-edit-submit').click();
    await expect(page.getByTestId('zone-edit-submit')).toHaveCount(0);

    await page.reload();
    await page.getByTestId('cfg-nav-zones').click();
    await expect(page.getByText(nomZoneModifie, { exact: true })).toBeVisible();
  });

  const nomBoutique = `E2E Boutique ${ts}`;
  const nomBoutiqueModifie = `E2E Boutique ${ts} modifiée`;
  let boutiqueId = '';

  await test.step('Boutique : créer (auto-provisionne caisse+entrepôt+tiroir), vérifier', async () => {
    await page.getByTestId('cfg-nav-magasins').click();
    await page.getByTestId('boutique-create-btn').click();
    await page.locator('#nb').fill(nomBoutique);
    await page.locator('#ab').fill(`123 rue E2E ${ts}`);
    await page.locator('#zb').selectOption({ label: nomZoneModifie });

    const respBoutique = page.waitForResponse(
      (r) => r.url().includes('/boutiques') && r.request().method() === 'POST',
    );
    await page.getByTestId('boutique-create-submit').click();
    const res = await respBoutique;
    expect(res.ok(), await res.text()).toBeTruthy();
    const body = (await res.json()) as { id: string };
    boutiqueId = body.id;
    expect(boutiqueId).toBeTruthy();

    await expect(page.getByTestId('boutique-create-error')).toHaveCount(0);
    await expect(page.getByText(nomBoutique, { exact: true })).toBeVisible();
  });

  await test.step('Boutique : modifier, désactiver, vérifier la persistance', async () => {
    await page.getByRole('button', { name: `Ouvrir la fiche ${nomBoutique}` }).click();
    await page.locator('#edit-bn').fill(nomBoutiqueModifie);
    await page.getByTestId('boutique-edit-actif').uncheck();
    await page.getByTestId('boutique-edit-submit').click();
    await expect(page.getByTestId('boutique-edit-error')).toHaveCount(0);

    await page.reload();
    await page.getByTestId('cfg-nav-magasins').click();
    await page.getByRole('button', { name: `Ouvrir la fiche ${nomBoutiqueModifie}` }).click();
    await expect(page.locator('#edit-bn')).toHaveValue(nomBoutiqueModifie);
    await expect(page.getByTestId('boutique-edit-actif')).not.toBeChecked();
    // Réactivation : nécessaire pour que les étapes suivantes (entrepôt,
    // caisse) portent sur un magasin actif cohérent avec le reste du parc.
    await page.getByTestId('boutique-edit-actif').check();
    await page.getByTestId('boutique-edit-submit').click();
    await expect(page.getByTestId('boutique-edit-error')).toHaveCount(0);
  });

  const nomEntrepot = `E2E Entrepot ${ts}`;
  const nomEntrepotModifie = `E2E Entrepot ${ts} modifié`;

  await test.step('Entrepôt : créer secondaire, vérifier, modifier, désactiver, persistance', async () => {
    await page.getByTestId('cfg-nav-entrepots').click();
    await page.getByTestId('entrepot-create-btn').click();
    await page.locator('#en').fill(nomEntrepot);
    await page.locator('#ec').fill(`SEC-${ts}`);
    await page.locator('#eb').selectOption({ label: nomBoutiqueModifie });
    await page.getByTestId('entrepot-create-submit').click();
    await expect(page.getByTestId('entrepot-create-error')).toHaveCount(0);
    await expect(page.getByText(nomEntrepot, { exact: true })).toBeVisible();

    await page
      .getByRole('button', { name: `Ouvrir ${nomEntrepot}` })
      .getByText(nomEntrepot, { exact: true })
      .click();
    await page.locator('#ee-nom').fill(nomEntrepotModifie);
    await page.getByTestId('entrepot-edit-actif').uncheck();
    await page.getByTestId('entrepot-edit-submit').click();
    await expect(page.getByTestId('entrepot-edit-error')).toHaveCount(0);

    await page.reload();
    await page.getByTestId('cfg-nav-entrepots').click();
    await page
      .getByRole('button', { name: `Ouvrir ${nomEntrepotModifie}` })
      .getByText(nomEntrepotModifie, { exact: true })
      .click();
    await expect(page.locator('#ee-nom')).toHaveValue(nomEntrepotModifie);
    await expect(page.getByTestId('entrepot-edit-actif')).not.toBeChecked();
    await page.getByTestId('entrepot-edit-submit').click();
  });

  await test.step('Entrepôt : cas invalide — code PRINCIPAL en doublon sur le même magasin', async () => {
    await page.getByTestId('entrepot-create-btn').click();
    await page.locator('#en').fill(`E2E Entrepot doublon ${ts}`);
    await page.locator('#ec').fill('PRINCIPAL');
    await page.locator('#eb').selectOption({ label: nomBoutiqueModifie });
    await page.getByTestId('entrepot-create-submit').click();
    const err = page.getByTestId('entrepot-create-error');
    await expect(err).toBeVisible();
    await expect(err).toContainText(/existe déjà/i);
  });

  await test.step('Caisse magasin : créer via le formulaire dédié (magasin sans caisse)', async () => {
    expect(boutiqueId, 'boutiqueId capturé à la création de la boutique').toBeTruthy();

    // Le formulaire "Nouvelle caisse magasin" ne sert qu'aux magasins créés
    // avant l'auto-provisionnement (une boutique neuve reçoit déjà sa caisse
    // atomiquement). On orchestre donc un état réaliste par SQL direct : on
    // supprime la caisse MAGASIN fraîchement créée (aucune session/mouvement
    // ne la référence encore, donc suppression sûre), puis on bloque
    // l'auto-réparation admin (`POST /boutiques/completer-tous`) le temps du
    // test pour pouvoir exercer le formulaire manuel.
    await page.route('**/boutiques/completer-tous', (route) =>
      route.fulfill({ status: 503, body: 'blocked-for-e2e' }),
    );

    execSync(
      `psql "${DB_URL}" -c "DELETE FROM caisse WHERE \\"boutiqueId\\"='${boutiqueId}' AND type='MAGASIN'"`,
    );

    await page.reload();
    await page.getByTestId('cfg-nav-caisses').click();
    await expect(page.getByTestId('caisse-create-btn')).toBeVisible();
    await page.getByTestId('caisse-create-btn').click();
    await page.locator('#cb').selectOption({ label: nomBoutiqueModifie });

    const respCaisse = page.waitForResponse(
      (r) => r.url().includes('/caisses') && r.request().method() === 'POST',
    );
    await page.getByTestId('caisse-create-submit').click();
    const res = await respCaisse;
    expect(res.ok(), await res.text()).toBeTruthy();
    await expect(page.getByTestId('caisse-create-error')).toHaveCount(0);

    await page.unroute('**/boutiques/completer-tous');
    await page.reload();
    await page.getByTestId('cfg-nav-caisses').click();
    const ligneCaisseMagasin = page
      .locator('tr', { hasText: 'Caisse magasin' })
      .filter({ hasText: nomBoutiqueModifie });
    await expect(ligneCaisseMagasin).toBeVisible();
  });
});
