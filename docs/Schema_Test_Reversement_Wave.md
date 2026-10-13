% Schéma de test — Reversement automatique Wave
% Progiciel Caisses & CRM — Marché des Accessoires
% 13 octobre 2026

# Schéma de test — Reversement automatique Wave (payout)

## 1. Objet et périmètre

Ce document décrit le schéma de test de la fonctionnalité **reversement automatique Wave** : après capture d'un paiement client via Wave (ZenAPI), le montant net (moins commission) est automatiquement reversé vers le compte Wave Business de Major Auto Parts.

**Composants couverts :**

- `apps/api/prisma/migrations/20261013250000_wave_payout_reversement/` — modèle de données (`PayoutWave`, colonnes `parametre_shop`).
- `ShopPspPayoutService.declencherPayout()` — déclenchement du reversement après paiement réussi.
- `ShopPayoutWaveScheduler.sonderPayoutsEnCours()` — sondage périodique (cron 5 min) des reversements `EN_COURS`.
- `WaveAdapter.payout()` / `WaveAdapter.verifierPayout()` — appels à l'API Wave (`POST /v1/payout`, `GET /v1/payout/:id`).
- `ParametresShopController` — configuration (commission, bénéficiaire) et endpoint de test manuel `POST /parametres-shop/wave-payout/tester`.
- `ParametresShopPage.tsx` — IHM de configuration et de test.

**Hors périmètre de ce document :** le flux de capture du paiement client lui-même (session de checkout Wave, webhook `checkout.session.completed`), déjà couvert par `shop-psp-om-wave.e2e-spec.ts` et `wave.adapter.ts` (hors méthode `payout`).

## 2. Références cahier des charges

| Référence | Exigence | Application à ce module |
|---|---|---|
| §6.5 | Grand livre / traçabilité financière | `PayoutWave` est une table d'écritures append par tentative : aucun montant de caisse n'est recalculé a posteriori, chaque transition de statut est actée par un `UPDATE` horodaté (`updatedAt`) mais l'historique des tentatives (`tentatives`) et l'audit append-only tracent la chronologie. |
| §6.7 | Journal d'audit horodaté et non modifiable | Toute transition (`PAYOUT_WAVE_INITIE`, `_REUSSI`, `_ECHEC`, `_TEST`) doit produire une entrée dans `journal_audit` (append-only, vérifié en base réelle). |
| §6.7 | Alertes automatiques (écart, retard) | Un reversement bloqué en `EN_COURS` au-delà de 20 tentatives (~1h40) bascule en `ECHEC` et doit être visible/alertable — **gap identifié en §6 ci-dessous**. |
| §4 / §6.2 | RBAC serveur sur chaque endpoint sensible | Configuration et déclenchement de test réservés à `RESPONSABLE_SI` et `DIRECTION_GENERALE` (`ROLES_PARAMETRES_SHOP`), vérifié par rejet 403 explicite. |
| Architecture | Zéro donnée mockée, DB réelle en test | Tests d'intégration/e2e sur PostgreSQL éphémère (Testcontainers, `PostgresTestEnvironment`) ; seuls les appels sortants vers l'API Wave sont simulés (mock HTTP / absence de clé), jamais la base. |

## 3. Stratégie de test (pyramide)

| Niveau | Objectif | Outil | DB |
|---|---|---|---|
| Unitaire | Logique métier isolée (calcul commission, machine de statuts, idempotence) | Jest, `prisma`/`audit`/`waveAdapter` en doubles de test (jest mocks) | Aucune (logique pure) |
| Unitaire adaptateur | Mapping requêtes/réponses HTTP Wave | Jest, `global.fetch` mocké | N/A |
| Intégration e2e | RBAC, validation DTO, persistance, audit réellement écrit | Jest + Supertest | PostgreSQL réel (Testcontainers) |

Les doubles de test sur `prisma`/`audit`/`waveAdapter` au niveau unitaire sont acceptables car ils isolent une règle de calcul/orchestration déjà revérifiée en intégration avec une vraie base — cohérent avec le principe « zéro mock » qui vise les données métier, pas les frontières d'infrastructure en test unitaire pur.

## 4. Matrice de cas de test — `ShopPspPayoutService.declencherPayout()`

Fichier : `apps/api/src/shop/psp/shop-psp-payout.service.spec.ts`

| # | Cas | Donné | Quand | Attendu | État |
|---|---|---|---|---|---|
| 1 | Provider ≠ WAVE | commande `providerPsp: 'PAYSTACK'` | `declencherPayout` | Aucun appel Prisma/Wave | ✅ couvert |
| 2 | Bénéficiaire non configuré | `waveBeneficiaireMobile: null` | `declencherPayout` | Aucun `PayoutWave.create`, aucun appel Wave, log warn | ✅ couvert |
| 3 | `ParametreShop` introuvable | `findFirst` → `null` | `declencherPayout` | Idem #2, pas d'exception | ✅ couvert |
| 4 | Calcul commission par défaut (1,5 %) | montant 1000 | `declencherPayout` | net = 985, commission = 15, `idempotencyKey = wave-payout:<clientOperationId>` | ✅ couvert |
| 5 | Commission personnalisée (3 %) | `waveCommissionPourcent = 3` | `declencherPayout` | net = 970, commission = 30 | ✅ couvert |
| 6 | Doublon (webhook Wave renvoyé) | `PayoutWave.create` lève `P2002` | `declencherPayout` | Retour silencieux, aucun appel Wave (pas de double reversement) | ✅ couvert |
| 7 | Wave répond `succeeded` | — | `declencherPayout` | statut `REUSSI`, audit `PAYOUT_WAVE_REUSSI` | ✅ couvert |
| 8 | Wave répond `failed` | `erreurCode` présent | `declencherPayout` | statut `ECHEC` + `erreurCode`, audit `PAYOUT_WAVE_ECHEC` | ✅ couvert |
| 9 | Wave répond `processing` | — | `declencherPayout` | statut `EN_COURS` (pris en charge par le scheduler) | ⚠️ à écrire — aucun test n'affirme explicitement `EN_COURS` (seul le mapping succeeded/failed est vérifié) |
| 10 | Erreur réseau/HTTP lors de l'appel `waveAdapter.payout` | rejet | `declencherPayout` | Catché, statut `ECHEC`, `erreurMessage` renseigné, **pas de propagation** | ✅ couvert |
| 11 | Erreur inattendue en amont (ex. DB down sur `findFirst`) | rejet | `declencherPayout` | Catché globalement, ne doit jamais faire échouer la capture de paiement déjà actée | ✅ couvert |
| 12 | Arrondi du montant net | montant brut non entier après commission | `declencherPayout` | `Math.round` appliqué, pas de centimes résiduels | ⚠️ à écrire — couvert indirectement par #4/#5 (résultats entiers), pas de cas avec reste `.5` explicite |

## 5. Matrice de cas de test — `ShopPayoutWaveScheduler.sonderPayoutsEnCours()`

Fichier : `apps/api/src/shop/psp/shop-payout-wave.scheduler.spec.ts`

| # | Cas | État |
|---|---|---|
| 1 | Ne sonde que les lignes `statut = EN_COURS` | ✅ couvert |
| 2 | `succeeded` → `REUSSI` + audit `PAYOUT_WAVE_REUSSI` | ✅ couvert |
| 3 | `failed` → `ECHEC` + `erreurCode` + audit `PAYOUT_WAVE_ECHEC` | ✅ couvert |
| 4 | `processing` → incrémente `tentatives` sans changer le statut | ✅ couvert |
| 5 | `processing` au-delà du plafond (20 tentatives) → bascule `ECHEC` avec `erreurCode = plafond_tentatives_atteint` | ✅ couvert |
| 6 | Erreur réseau sur `verifierPayout` → ligne inchangée (réessai au cycle suivant) | ✅ couvert |
| 7 | Une ligne en erreur n'empêche pas le traitement des lignes suivantes (boucle résiliente) | ✅ couvert |
| 8 | `payout.referenceProvider` est `null` (résultat Wave jamais reçu côté `create`) | ⚠️ à écrire — le code retourne tôt (`if (!payout.referenceProvider) return;`) mais aucun test ne l'exerce explicitement |
| 9 | Exécution planifiée réelle (`@Cron(EVERY_5_MINUTES)`) déclenche bien la méthode | ⚠️ hors périmètre unitaire — à valider en recette/exploitation (le décorateur Nest n'est pas testé par Jest) |

## 6. Matrice de cas de test — `WaveAdapter.payout()` / `verifierPayout()`

Fichier : `apps/api/src/shop/psp/wave-payout.spec.ts`

| # | Cas | État |
|---|---|---|
| 1 | Requête `POST /v1/payout` avec en-tête `Idempotency-Key` correct | ✅ couvert |
| 2 | `receive_amount` arrondi à l'entier le plus proche | ✅ couvert |
| 3 | `payment_reason` tronqué à 40 caractères (contrainte API Wave) | ✅ couvert |
| 4 | Statut `failed` avec `payout_error.code` mappé en `erreurCode` | ✅ couvert |
| 5 | `WAVE_API_KEY` absent → exception avant tout appel réseau | ✅ couvert |
| 6 | Réponse HTTP non-OK → exception réessayable par l'appelant | ✅ couvert |
| 7 | `GET /v1/payout/:id` mappe le statut terminal | ✅ couvert |
| 8 | `GET /v1/payout/:id` remonte `erreurCode` si `failed` | ✅ couvert |
| 9 | Réponse HTTP non-OK sur la vérification → exception | ✅ couvert |
| 10 | Nom bénéficiaire optionnel (`nom`) transmis uniquement si fourni | ⚠️ à écrire — testé indirectement par le passage de `nom: 'Major Auto Parts'` dans le cas #1, mais pas de cas explicite **sans** `nom` |

## 7. Matrice de cas de test — API `/parametres-shop` (RBAC, validation, audit)

Fichier : `apps/api/test/parametres-shop-wave.e2e-spec.ts` (PostgreSQL réel)

| # | Cas | Rôle | Attendu | État |
|---|---|---|---|---|
| 1 | `PATCH /parametres-shop` | `CAISSIER_BOUTIQUE` | 403 explicite | ✅ couvert |
| 2 | `PATCH /parametres-shop` (commission + bénéficiaire) | `RESPONSABLE_SI` | 200, valeurs persistées | ✅ couvert |
| 3 | `PATCH /parametres-shop` avec numéro mal formé | `RESPONSABLE_SI` | 400 (`@Matches`) | ✅ couvert |
| 4 | `POST /parametres-shop/wave-payout/tester` | `CAISSIER_BOUTIQUE` | 403 explicite | ✅ couvert |
| 5 | `POST .../tester` sans bénéficiaire configuré | `RESPONSABLE_SI` | 400 | ✅ couvert |
| 6 | `POST .../tester` sans `WAVE_API_KEY` (env e2e) | `RESPONSABLE_SI` | 503, `waveBeneficiaireTesteAt` reste `null`, audit `PAYOUT_WAVE_TEST` avec « échec » | ✅ couvert |
| 7 | `PATCH /parametres-shop` par `DIRECTION_GENERALE` | `DIRECTION_GENERALE` | 200 (second rôle autorisé par `ROLES_PARAMETRES_SHOP`) | ⚠️ à écrire — seul `RESPONSABLE_SI` est exercé côté « autorisé » |
| 8 | `POST .../tester` réussi (clé Wave valide, sandbox) → `waveBeneficiaireTesteAt` mis à jour + audit sans « échec » | — | 200/201, horodatage mis à jour | ⚠️ à écrire — nécessite une clé Wave sandbox ; actuellement seul le chemin 503 (clé absente) est testé |
| 9 | `commission` hors bornes (`<0` ou `>100`) | `RESPONSABLE_SI` | 400 (`@Min(0)` / `@Max(100)`) | ⚠️ à écrire |
| 10 | Lecture (`GET /parametres-shop`) par rôle hors périmètre (ex. `CONTROLEUR_INTERNE`) | — | 403 | ⚠️ à écrire — vérifier que la lecture est bien restreinte, pas seulement l'écriture |

## 8. Points de non-régression critiques

1. **Un échec de reversement Wave ne doit jamais invalider ni annuler la capture du paiement client déjà actée.** Vérifié par `shop-psp-payout.service.spec.ts` (cas #10/#11) et par l'appel `.catch()` dans `ShopPspService` (`apps/api/src/shop/psp/shop-psp.service.ts`) qui empêche toute propagation vers `lifecycle.apresPaiementReussi`.
2. **Idempotence** : un même `clientOperationId` ne doit jamais générer deux reversements (contrainte unique `idempotencyKey`/`commandeWebId` + gestion `P2002`). Vérifié au niveau service (cas #6) — recommandé d'ajouter un test e2e simulant un double appel `declencherPayout` sur la même commande contre une vraie base pour prouver la contrainte DB (pas seulement le mock Prisma).
3. **Audit append-only** : chaque transition produit une ligne dans `journal_audit`, jamais de `UPDATE`/`DELETE` sur l'historique. Vérifié en e2e (cas §7.6) pour le chemin `PAYOUT_WAVE_TEST` ; les actions `PAYOUT_WAVE_INITIE/_REUSSI/_ECHEC` du flux automatique ne sont vérifiées qu'en unitaire (mock `audit.record`), pas encore en e2e avec écriture réelle en base.

## 9. Gaps identifiés (synthèse, à trancher avant clôture)

| Gap | Risque | Action proposée |
|---|---|---|
| Pas de test e2e déclenchant réellement `declencherPayout` depuis un paiement Wave capturé en base (flux complet checkout → payout → audit DB réel) | Risque de régression d'intégration non détectée par les tests unitaires isolés | Ajouter un scénario e2e dans `shop-psp-om-wave.e2e-spec.ts` ou dédié, avec `WaveAdapter.payout` mocké mais DB réelle de bout en bout |
| Reversement en `ECHEC` (plafond de tentatives ou échec Wave) non relié à une alerte automatique (§6.7 alertes) | Un reversement bloqué peut rester invisible de l'équipe DAF/DG | Vérifier avec l'utilisateur si une alerte dédiée (`AlertesService`) doit être déclenchée sur `PAYOUT_WAVE_ECHEC` — **à ne pas trancher seul, cahier des charges muet sur ce cas précis** |
| `DIRECTION_GENERALE` jamais exercé comme rôle « autorisé » dans les tests e2e (seul le rejet 403 et `RESPONSABLE_SI` autorisé le sont) | Un bug cassant l'accès DG passerait inaperçu | Ajouter le cas §7.7 |
| Pas de test sur les bornes de validation `waveCommissionPourcent` (0–100) | Une commission négative ou >100 % pourrait être acceptée si la validation régresse | Ajouter le cas §7.9 |
| Pas de test confirmant qu'un chemin « succès réel » met à jour `waveBeneficiaireTesteAt` | Le seul chemin e2e testé est l'échec (503, pas de clé) | Nécessite une sandbox Wave ; à défaut, ajouter un test avec `WaveAdapter` substitué par un double dans le module de test e2e pour simuler un `processing`/`succeeded` |

## 10. Definition of Done (checklist, conforme CLAUDE.md)

- [x] Migration Prisma (`20261013250000_wave_payout_reversement`)
- [x] Endpoints (`PATCH /parametres-shop`, `POST /parametres-shop/wave-payout/tester`)
- [x] Test RBAC (403 explicite pour rôle non autorisé, sur les deux endpoints)
- [ ] Test RBAC positif pour **tous** les rôles autorisés (`DIRECTION_GENERALE` manquant — §7.7)
- [x] Test de transition d'état (`EN_ATTENTE → EN_COURS/REUSSI/ECHEC`, plafond de tentatives)
- [x] Test d'intégration DB réelle (Testcontainers, `parametres-shop-wave.e2e-spec.ts`)
- [x] Entrée d'audit vérifiée (au moins un chemin, §7.6)
- [ ] Entrée d'audit vérifiée en base réelle pour le flux automatique (`PAYOUT_WAVE_INITIE/_REUSSI/_ECHEC`) — actuellement seulement en mock
- [x] Référence cahier des charges couverte (§4, §6.2, §6.5, §6.7 — ce document)

## 11. Commandes d'exécution

```bash
pnpm --filter api test -- shop-psp-payout.service.spec.ts
pnpm --filter api test -- shop-payout-wave.scheduler.spec.ts
pnpm --filter api test -- wave-payout.spec.ts
pnpm --filter api test:e2e -- parametres-shop-wave.e2e-spec.ts
```
