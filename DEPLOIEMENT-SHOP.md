# Déploiement stack shop (Option A — DMZ)

## Prérequis

- Docker + Compose v2
- Fichier `.env.shop` (copier depuis `.env.shop.example`)
- Secrets Paystack sandbox/live
- Stack interne sur réseau privé partagé (PostgreSQL) ou instance dédiée

## Démarrage

```bash
cp .env.shop.example .env.shop
# Éditer POSTGRES_PASSWORD, JWT_SECRET_SHOP, PAYSTACK_*

docker compose --env-file .env.shop -f docker-compose.shop.yml up -d --build
```

Boutique : `http://localhost:8080` (par défaut).

## Architecture

- `api-shop` : NestJS `main.shop.js` — routes `/shop/*` uniquement
- `gateway-shop` : SPA `apps/shop` + proxy nginx vers `api-shop`
- `db` : PostgreSQL (réseau interne shop-backend)

## Checklist go-live

- [ ] Token staff → 404 sur `api-shop` (test `shop-isolation.e2e-spec.ts`)
- [ ] Webhook Paystack live configuré vers `/shop/webhooks/paystack`
- [ ] `ParametreShop.shopActif = true`, produits `visibleWeb` + `prixWeb`
- [ ] Zones livraison et boutiques retrait actives
- [ ] **Resend** : `EMAIL_PROVIDER=resend`, `RESEND_API_KEY`, `SHOP_EMAIL_FROM` (domaine vérifié), `SHOP_ADMIN_EMAIL`
- [ ] TLS + WAF en frontal
- [ ] `SEED_ON_START=false`
- [ ] PWA : HTTPS (obligatoire hors localhost), `manifest.webmanifest` + `sw.js` servis sans cache agressif (déjà dans `nginx.prod.conf`)

## PWA (Progressive Web App)

Le front `apps/shop` est installable (écran d’accueil) via `vite-plugin-pwa` :
- shell + assets en precache ;
- `/shop/*` en NetworkFirst (catalogue lisible hors-ligne si déjà vu) ;
- bannière « Installer MAJOR » + maj service worker.

Test local après build :

```bash
pnpm --filter shop build && pnpm --filter shop preview
```

## Tests CI

```bash
pnpm --filter api test:e2e -- shop-isolation shop-checkout shop-foundation
pnpm exec jest src/shop --runInBand
```
