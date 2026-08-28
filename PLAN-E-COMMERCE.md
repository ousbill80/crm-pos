# Plan technique — E-commerce isolé (Marché Accessoires)

Document de référence pour la **boutique en ligne B2C complète**, **séparée**
du progiciel caisse/CRM interne. Autorité métier : `CLAUDE.md` + cahier des
charges §6.6 (CRM), §6.7 (sécurité, audit, continuité).

**Principe directeur :** le site e-commerce est **critique** et **isolé** du
logiciel opérationnel. Il partage la **base PostgreSQL métier** via une
**frontière API publique minimale** (`api-shop` / `/shop/*`).

---

## Décisions validées (Direction — Phase 0)

| Sujet | Décision |
|-------|----------|
| Architecture production | **Option A — isolation maximale** (`api-shop` + stack shop séparée) |
| Périmètre go-live | **Site e-commerce fonctionnel complet** — pas de MVP réduit |
| Fulfillment | **Click & collect ET livraison** dès le go-live |
| PSP | **Orange Money**, **Wave**, **carte via Paystack** (3 canaux) |
| Checkout invité | **Oui** (§6.6 — client optionnel) |
| Entrepôt / stock web | **Paramétrable** (société + par boutique) |
| Affichage prix boutique | **Configurable** HT ou TTC (`ParametreShop`) |
| Grille tarifaire web | **`prixWeb` dédié**, configurable par produit + fallback paramétrable |
| Paiement différé | **Oui, configurable** — espèces au retrait et/ou à la livraison, en plus des 3 PSP |
| Option B (monolithe) | **Dev / staging uniquement** — jamais en production |

**Phase 0 métier : complète** — codage Lot 1 autorisé.

---

## 1. Architecture production — Option A (figée)

```
Internet + WAF
      │
      ▼
┌──────────────────────────────────────────┐
│  STACK SHOP (DMZ)                        │
│  boutique.example.com                    │
│  ┌────────────┐  ┌──────────┐  ┌───────┐ │
│  │ apps/shop  │→ │ api-shop │→ │  DB   │ │
│  │ (React)    │  │ /shop/*  │  │ (privé)│ │
│  └────────────┘  └──────────┘  └───┬───┘ │
└────────────────────────────────────│─────┘
                                     │ réseau privé (VPC)
┌────────────────────────────────────│─────┐
│  STACK INTERNE (VPN / LAN)         │     │
│  caisse.example.com — NON public   ▼     │
│  apps/web + apps/mobile + api-internal   │
└──────────────────────────────────────────┘
```

| Composant | Shop (public) | Interne (privé) |
|-----------|---------------|-----------------|
| Image Docker | `Dockerfile.shop` → `ShopModule` seul | `Dockerfile.internal` → reste |
| Frontend | `apps/shop` | `apps/web`, `apps/mobile` |
| JWT | `CompteClient` | `Utilisateur` + RBAC §6.2 |
| Secrets | Paystack, OM, Wave, JWT shop | JWT staff |
| CI/CD | Pipeline shop indépendant | Pipeline interne |

---

## 2. Périmètre fonctionnel complet (go-live)

### Vitrine & catalogue

- Accueil, catégories, recherche, filtres, tri
- Fiche produit : galerie, variantes, stock, **prix selon `ParametreShop.modeAffichagePrix`** (HT/TTC)
- SEO : slugs, meta, sitemap, Open Graph
- Pages légales : CGV, confidentialité, retours (contenu = Direction)
- Design system moderne, mobile-first, WCAG 2.1 AA

### Panier & checkout

- Panier persistant (invité : cookie signé ; connecté : compte)
- Réservation stock TTL paramétrable
- **Checkout invité** ou compte (§6.6)
- Choix mode fulfillment :
  - **RETRAIT_BOUTIQUE** (click & collect) — sélection boutique active
  - **LIVRAISON** — adresse, zone, frais calculés
- Récapitulatif, consentement marketing optionnel
- Codes promo / fidélité (remise palier Argent/Or si connecté + `Client`)

### Paiement (3 PSP + différé configurable)

| Canal | Provider / mode | Usage |
|-------|-----------------|-------|
| Carte bancaire | **Paystack** | Visa/Mastercard — redirect hosted |
| Mobile Money | **Orange Money** | API opérateur / agrégateur |
| Mobile Money | **Wave** | API Wave |
| **À la réception** | `PAIEMENT_RETRAIT` | Espèces (ou autre) au click & collect — si `ParametreShop.paiementRetraitActif` |
| **À la livraison** | `PAIEMENT_LIVRAISON` | Espèces à la livraison — si `ParametreShop.paiementLivraisonActif` |

- Modes différés activables **indépendamment** par fulfillment (back-office SI/Direction)
- Commande différée : pas de webhook PSP → `PREPARATION` directe après checkout ; `PAYEE` à la remise/livraison (encaissement staff)
- Webhooks signés, idempotents, journal append-only (PSP en ligne uniquement)
- Échec paiement PSP → libération réservation après timeout
- Remboursement PSP = écriture compensatoire (pas d’édition du paiement validé)

### Compte client

- Inscription / connexion / mot de passe oublié
- Profil, adresses de livraison multiples
- Historique commandes + suivi statut
- Lien fiche CRM `Client` — historique achats réseau (§6.6)
- Fidélité : points à la clôture commande (règles existantes)

### Livraison

- Zones de livraison paramétrables (ville, région, tarif forfait ou tranches poids)
- Statuts : `EXPEDIEE` → `LIVREE` (+ preuve / signature optionnelle phase 2)
- Notifications e-mail/SMS à chaque transition
- Bon de livraison PDF (back-office)

### Click & collect

- Boutiques éligibles au retrait (`retraitWebActif`)
- Notification boutique quand commande `PAYEE`
- Préparation → `PRETE` → QR code client
- Remise en boutique : conversion `Vente` POS (scan QR)

### Back-office (`apps/web` — staff only)

- Module « Commandes web » : liste, filtres, détail, changement statut
- Paramétrage shop : entrepôts web, zones livraison, frais, boutiques retrait, **TVA/TTC, prix web, paiement différé**
- Fiche produit : champ **`prixWeb`** (+ visibilité web) éditable catalogue staff
- Pas d’accès depuis `apps/shop`

### Hors périmètre v1 (explicitement exclu)

- Marketplace multi-vendeurs
- Devis B2B self-service (`DevisClient` reste interne)
- Avis clients / wishlist (v2)
- Intégration transporteur tierce (Colissimo-style) — livraison gérée en interne v1

---

## 3. Paramétrage entrepôt, prix, TVA & fulfillment

### Niveau société (`ParametreShop` — 1:1 `Societe`)

```
shopActif                         Boolean
entrepotWebDefautId               Entrepot?
dureeReservationPanierMin         Int              // ex. 15
retraitActif                      Boolean
livraisonActive                   Boolean
deviseAffichage                   String           // XOF — aligné Societe

// --- Prix & TVA (configurable Direction/SI) ---
modeAffichagePrix                 HT | TTC         // défaut affichage boutique
tauxTvaDefaut                     Decimal          // ex. 18.00 — taux société
afficherDetailTvaPanier           Boolean          // ligne TVA séparée si TTC

// --- Grille tarifaire web ---
fallbackPrixMagasin               Boolean          // true : prixWeb null → prixUnitaire POS
                                                  // false : produit masqué sur le web

// --- Paiement différé (en plus des PSP) ---
paiementRetraitActif              Boolean          // espèces au click & collect
paiementLivraisonActif            Boolean          // espèces à la livraison
modesPaiementRetraitAutorises     ModePaiement[]   // ex. [ESPECES, MOBILE_MONEY]
modesPaiementLivraisonAutorises   ModePaiement[]   // ex. [ESPECES]
```

### Niveau produit (`Produit` — extensions)

```
prixWeb              Decimal?     // grille canal WEB — prioritaire si renseigné
visibleWeb           Boolean      // false → jamais exposé sur /shop/catalogue
tauxTva              Decimal?     // null → ParametreShop.tauxTvaDefaut
slug                 String?      @unique  // URL SEO /produit/:slug
```

### Règle de résolution prix catalogue shop

```
1. Si !visibleWeb → produit exclu du catalogue public
2. base = prixWeb ?? (fallbackPrixMagasin ? prixUnitaire : null)
3. Si base == null → produit exclu
4. taux = produit.tauxTva ?? ParametreShop.tauxTvaDefaut
5. Si modeAffichagePrix == TTC → afficher base × (1 + taux/100), arrondi 2 déc.
6. Si modeAffichagePrix == HT  → afficher base (prixWeb / prixUnitaire sont HT en base)
7. LigneCommandeWeb : snapshot prixUnitaireHt, tauxTva, montantTva, prixUnitaireAffiche
```

Le POS conserve `prixUnitaire` (HT, inchangé). Le shop ne lit **jamais** `prixUnitaire`
directement sauf si `fallbackPrixMagasin = true` et `prixWeb` absent.

### Niveau boutique (`Boutique` — extensions)

```
retraitWebActif              Boolean       // proposer en click & collect
entrepotWebId                Entrepot?     // null → entrepotWebDefautId société
delaiRetraitHeures           Int?          // SLA affiché client
```

### Règle de résolution stock au checkout

```
1. Mode RETRAIT → entrepotWebId de la boutique choisie (ou défaut société)
2. Mode LIVRAISON → entrepotWebDefautId société (ou règle zone → entrepôt, paramétrable)
3. Stock disponible = StockService.getDisponible(produit, entrepotId)
4. Si rupture → ligne refusée ou liste d’attente (v2) — v1 : refus explicite
```

Paramétrage éditable par **Responsable SI / Direction** dans `apps/web` →
Entreprise / Boutiques (pas de reparamétrage lourd §6.7).

---

## 4. Modèle de données (extensions Prisma)

### `CompteClient`

```
id, email (unique), passwordHash, clientId → Client
emailVerifie, actif, refreshTokenHash?, createdAt
```

### `AdresseClient`

```
id, compteClientId?, clientId? (invité : snapshot checkout seulement)
libelle, ligne1, ligne2, ville, region, codePostal?, pays, telephone
```

### `CommandeWeb`

```
id, clientOperationId (unique)
statut, modeFulfillment: RETRAIT_BOUTIQUE | LIVRAISON
modeReglement: PREPAYE_PSP | PAIEMENT_RETRAIT | PAIEMENT_LIVRAISON
providerPsp?: PAYSTACK | ORANGE_MONEY | WAVE   // si PREPAYE_PSP
canal = WEB
clientId?, compteClientId?, emailInvite?, telephoneInvite?
boutiqueRetraitId?, entrepotId
adresseLivraisonId? / snapshotJson
montantArticlesHt, montantTva, montantArticlesTtc  // snapshots fiscal
remiseFidelite, fraisLivraison, montantTotal
numeroSuivi?, noteClient?
payeeAt, expireAt, createdAt, updatedAt
```

### `LigneCommandeWeb`

```
produitId, quantite
prixUnitaireHt, tauxTva, montantTvaLigne, prixUnitaireTtc  // snapshot checkout
designationSnapshot, referenceSnapshot
```

### `ReservationWeb`, `PaiementCommandeWeb`, `ConversionCommandeVente`

(Paiements append-only — voir §6 ; conversion Vente POS à REMISE/LIVREE.)

### `ZoneLivraison`

```
id, libelle, actif, tarifForfait, delaiJoursMin, delaiJoursMax
codesPostaux? / villes[] (JSON paramétrable)
```

### `ParametreShop`

(Liaison `Societe` — voir §3.)

### Enums Prisma (Lot 1)

```
ModeAffichagePrixShop    HT | TTC
ModeReglementCommandeWeb PREPAYE_PSP | PAIEMENT_RETRAIT | PAIEMENT_LIVRAISON
ProviderPspShop          PAYSTACK | ORANGE_MONEY | WAVE
```

---

## 5. Machine à états — `CommandeWeb`

### Branche PREPAYE_PSP (Paystack / OM / Wave)

```
PANIER → EN_ATTENTE_PAIEMENT → (webhook PSP) PAYEE → PREPARATION → …
```

### Branche PAIEMENT_RETRAIT / PAIEMENT_LIVRAISON (différé configurable)

```
PANIER → checkout validé → PREPARATION   // pas d'étape EN_ATTENTE_PAIEMENT PSP
PREPARATION → … → REMISE | LIVREE
REMISE | LIVREE → (staff encaisse) PAYEE  // Vente POS + ModePaiement physique
```

Le stock est réservé dès le checkout (TTL identique). Annulation staff possible
tant que non remise/livrée.

### Fulfillment commun (après `PREPARATION`)

**Branche RETRAIT_BOUTIQUE :**

```
PREPARATION → PRETE → REMISE → PAYEE (si différé) / terminal (si déjà PAYEE)
```

**Branche LIVRAISON :**

```
PREPARATION → EXPEDIEE → LIVREE → PAYEE (si différé) / terminal (si déjà PAYEE)
```

### Annulations & remboursements

```
EN_ATTENTE_PAIEMENT → ANNULEE (client / timeout PSP)
PREPARATION (différé, non expédié) → ANNULEE (client ou staff)
PAYEE | PREPARATION (prépayé) → ANNULEE (staff — remboursement PSP si prépayé)
PAYEE+ (prépayé) → REMBOURSEE (écriture compensatoire PSP)
```

**§6.2 :** aucune transition ne touche `TransactionCaisse`. Trésorerie physique
(espèces boutique) hors scope web.

**Vente POS :** créée à `REMISE` (retrait) ou à `LIVREE` (livraison).
- **PREPAYE_PSP** : CA comptabilisé au webhook `PAYEE` ; Vente POS reflète le règlement en ligne.
- **PAIEMENT_*** différé : CA et `Vente` à l'encaissement physique (`REMISE` / `LIVREE`).

---

## 6. Intégration PSP

### Pattern commun (`ShopPspAdapter`)

Interface partagée par les 3 PSP — implémentée en Lot 4 après modèle `PaiementCommandeWeb` :

```typescript
interface ShopPspAdapter {
  provider: 'PAYSTACK' | 'ORANGE_MONEY' | 'WAVE';
  initierPaiement(input: InitPaiementInput): Promise<InitPaiementResult>;
  verifierWebhook(headers: Record<string, string>, rawBody: Buffer): PspEvenement | null;
  rembourser(paiement: PaiementCommandeWeb, montant: Decimal): Promise<RemboursementResult>;
}
```

Règles transverses (append-only §6.7) :

- **Source de vérité paiement** = webhook signé (pas le redirect client seul)
- **Idempotence** : clé = `(provider, referenceExterne)` unique sur `PaiementCommandeWeb`
- **Montant** : toujours re-vérifier côté serveur vs `CommandeWeb.montantTotal`
- **Journal** : chaque webhook reçu → ligne audit append-only avant traitement
- **Réponse HTTP** : `200 OK` immédiat après persistance ; traitement métier async si > 2 s

Variables d'environnement (`api-shop` uniquement) :

```
PAYSTACK_SECRET_KEY=sk_test_… / sk_live_…
PAYSTACK_PUBLIC_KEY=pk_test_… / pk_live_…
PAYSTACK_WEBHOOK_URL=https://boutique.example.com/shop/webhooks/paystack
ORANGE_MONEY_*   (Lot 4b)
WAVE_*           (Lot 4c)
```

---

### 6.1 Paystack (carte) — spec détaillée

**Priorité Lot 4** : Paystack en premier (pattern webhook réutilisé pour OM/Wave).

#### Flux checkout

```
Client → POST /shop/commandes/:id/payer { provider: 'PAYSTACK' }
       → api-shop : statut EN_ATTENTE_PAIEMENT, crée PaiementCommandeWeb (INITIE)
       → POST https://api.paystack.co/transaction/initialize
            amount     : montantTotal en sous-unité XOF (1 FCFA = 1)
            email      : compteClient.email | emailInvite
            reference  : clientOperationId (UUID commande — idempotent)
            callback_url : https://boutique.example.com/checkout/confirmation?ref=…
            metadata   : { commandeWebId, clientOperationId, modeFulfillment }
       ← { authorization_url, access_code, reference }
       → redirect client vers authorization_url (hosted — PCI : pas de PAN local)

Paystack → POST /shop/webhooks/paystack (charge.success)
       → vérif signature → transition PAYEE → PREPARATION
       → libère réservation TTL, crédit fidélité si clientId
```

#### Endpoint webhook

| | |
|---|---|
| **Route** | `POST /shop/webhooks/paystack` |
| **Auth** | Aucun JWT — signature HMAC uniquement |
| **Body parser** | `express.raw({ type: 'application/json' })` sur cette route seule |
| **Header** | `x-paystack-signature` = HMAC-SHA512(hex) du **raw body**, clé = `PAYSTACK_SECRET_KEY` |
| **Comparaison** | `crypto.timingSafeEqual` — rejeter `401` si mismatch |
| **IP optionnel** | Allowlist Paystack : `52.31.139.75`, `52.49.173.169`, `52.214.14.220` |

#### Événements traités

| Event Paystack | Action métier |
|----------------|---------------|
| `charge.success` | Si `data.reference` = `clientOperationId` et montant OK → `PAYEE` |
| `charge.failed` | Log audit ; commande reste `EN_ATTENTE_PAIEMENT` jusqu'au timeout |
| `refund.processed` | Écriture compensatoire `PaiementCommandeWeb` type REMBOURSEMENT |
| `charge.dispute.create` | Alerte staff + statut litige commande (back-office) |

Événements ignorés (log seulement) : subscription, transfer, invoice.

#### Vérifications obligatoires sur `charge.success`

```typescript
// data = event.data (Transaction object)
assert(data.status === 'success');
assert(data.currency === 'XOF');
assert(Number(data.amount) === commande.montantTotalEnSousUnite);
assert(data.reference === commande.clientOperationId);
// metadata.commandeWebId cohérent si présent
```

#### Modèle `PaiementCommandeWeb` (append-only)

```
id, commandeWebId, provider: PAYSTACK | ORANGE_MONEY | WAVE
type: INITIE | CAPTURE | REMBOURSEMENT | ECHEC
referenceExterne     // Paystack reference / OM txn id / Wave id
referenceProvider    // data.id Paystack (transaction id)
montant, devise (XOF)
statut: EN_COURS | REUSSI | ECHEC | REMBOURSE
payloadWebhookJson   // snapshot brut (audit)
webhookEventId       // idempotence : data.id + event type
createdAt            // pas de UPDATE — remboursement = nouvelle ligne
```

Contrainte unique : `@@unique([provider, webhookEventId])` pour rejouer webhooks sans double capture.

#### Remboursement Paystack

```
POST https://api.paystack.co/refund
  { transaction: referenceProvider, amount?: montantPartielEnSousUnite }
→ webhook refund.processed confirme
→ nouvelle ligne PaiementCommandeWeb type REMBOURSEMENT
→ CommandeWeb → REMBOURSEE (si total remboursé)
```

#### Redirect client (`callback_url`)

- **Informatif uniquement** — ne fait pas confiance au query string pour marquer PAYEE
- Page `/checkout/confirmation` poll `GET /shop/commandes/:id/statut` ou SSE
- Affiche « Paiement en cours de confirmation… » jusqu'à webhook traité (≤ 30 s)

#### Tests Lot 4 Paystack

1. Unit : HMAC signature (body valide / invalide / timing-safe)
2. Intégration : initialize → webhook simulé `charge.success` → statut PAYEE
3. Idempotence : double webhook même `data.id` → 1 seule capture
4. Montant incorrect → rejet + alerte audit, commande non payée
5. Token staff sur `/shop/webhooks/paystack` → N/A (route publique signée)

Sandbox Paystack obligatoire (`sk_test_…`) avant bascule live.

---

### 6.2 Orange Money (Lot 4b)

- Même interface `ShopPspAdapter`
- Webhook dédié `POST /shop/webhooks/orange-money`
- Secret signature propre (`ORANGE_MONEY_WEBHOOK_SECRET`)
- `ModePaiement` → `MOBILE_MONEY`

*(Spec détaillée à rédiger dès doc API opérateur / agrégateur validée.)*

---

### 6.3 Wave (Lot 4c)

- Même interface `ShopPspAdapter`
- Webhook dédié `POST /shop/webhooks/wave`
- Secret signature propre (`WAVE_WEBHOOK_SECRET`)
- `ModePaiement` → `MOBILE_MONEY`

*(Spec détaillée dès accès API Wave sandbox.)*

---

### Mapping comptable → `ModePaiement`

| PSP | ModePaiement existant |
|-----|----------------------|
| Paystack | `CARTE` |
| Orange Money | `MOBILE_MONEY` |
| Wave | `MOBILE_MONEY` |

---

## 7. API `/shop/*` (api-shop)

### Public / client

| Route | Description |
|-------|-------------|
| `GET /shop/catalogue/*` | Produits, catégories, détail slug |
| `GET /shop/livraison/zones` | Zones + tarifs actifs |
| `GET /shop/retrait/boutiques` | Boutiques click & collect |
| `POST /shop/panier/*` | CRUD panier |
| `POST /shop/checkout` | Valide adresse/mode/règlement → EN_ATTENTE_PAIEMENT ou PREPARATION |
| `POST /shop/commandes/:id/payer` | Initie PSP si `modeReglement = PREPAYE_PSP` |
| `POST /shop/webhooks/paystack` | Webhook Paystack |
| `POST /shop/webhooks/orange-money` | Webhook OM |
| `POST /shop/webhooks/wave` | Webhook Wave |
| `POST /shop/compte/*` | Inscription, login, reset password |
| `GET /shop/compte/commandes` | Historique + suivi |
| `GET /shop/suivi/:token` | Suivi invité (lien e-mail sans compte) |

### Interne (api-internal uniquement)

| Route | Rôle |
|-------|------|
| `GET/PATCH /commandes-web` | Staff — gestion commandes |
| `PATCH /parametres-shop` | SI / Direction |
| `CRUD /zones-livraison` | SI / Direction |
| `POST /commandes-web/:id/convertir-vente` | Caissier boutique (QR) |

---

## 8. Frontend `apps/shop`

Pages complètes :

- `/` Accueil
- `/catalogue`, `/catalogue/:categorie`, `/produit/:slug`
- `/panier`
- `/checkout` (étapes : coordonnées → mode → paiement → confirmation)
- `/compte`, `/compte/commandes`, `/compte/adresses`
- `/suivi/:token`
- `/cgv`, `/confidentialite`, `/retours`

Stack : React 19, Vite, TanStack Query, Zod, design tokens marque Accessoires.

---

## 9. Sécurité

- Option A : `api-shop` sans modules staff
- WAF + rate limit + CORS strict
- PCI : Paystack hosted — pas de PAN local
- Pentest surface `/shop/*` avant go-live
- Tests automatisés : token staff → 404 sur api-shop ; IDOR commandes

---

## 10. Déploiement

- `docker-compose.shop.yml` — stack shop (DMZ)
- `docker-compose.prod.yml` — stack interne (existant)
- PostgreSQL : une instance, réseau privé ; pas d’exposition port 5432
- `DEPLOIEMENT-SHOP.md` (à rédiger en Phase 7)

---

## 11. Ordre d’implémentation (site complet)

| # | Lot | Durée estimée |
|---|-----|---------------|
| 1 | Migrations Prisma + `ParametreShop` + entités commande | 2–3 sem |
| 2 | `ShopModule` + catalogue + panier + checkout | 3–4 sem |
| 3 | `Dockerfile.shop` + isolation + tests fuite RBAC | 1–2 sem |
| 4 | **Paystack** (webhooks + remboursement) puis OM + Wave | 3–4 sem |
| 5 | Livraison (zones, frais, statuts) + click & collect | 2–3 sem |
| 6 | `apps/shop` front complet | 5–6 sem |
| 7 | Back-office commandes + paramétrage | 2–3 sem |
| 8 | Compte client, fidélité, e-mails | 2 sem |
| 9 | Conversion Vente POS + QR | 2 sem |
| 10 | E2E shop, charge, pentest, prod | 2–3 sem |

**Total estimé :** ~24–30 semaines (équipe 2–3 devs) pour un site **complet**
isolation Option A.

Ordre imposé par `CLAUDE.md` : **modèle → API + tests → front shop**.

---

## 12. Prochaine action

**Phase 0 complète.** Démarrer **Lot 1** :

1. Migration Prisma : `ParametreShop`, `CommandeWeb`, `prixWeb`/`visibleWeb`/`tauxTva`/`slug` sur `Produit`
2. Service calcul prix shop (HT/TTC, fallback, snapshot lignes)
3. Tests intégration : résolution prix + modes règlement + machine à états différée

---

## Références

- `DEPLOIEMENT.md` — stack interne prod
- `CLAUDE.md` — règles métier
- Code réutilisable : `stock.service.ts`, `crm/*`, `ventes.service.ts`, `produits/*`
