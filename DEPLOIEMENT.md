# Déploiement production — Caisse CRM (web + API)

Couvre §6.7 (TLS, sauvegarde, continuité) et l'exploitation du progiciel en
réseau boutique (10 magasins + Café-Market).

## Architecture prod

```
Internet / LAN
      │
      ▼
┌─────────────┐     réseau interne     ┌─────┐
│  gateway    │ ─────────────────────► │ api │
│ nginx :80   │                        └──┬──┘
│ (TLS :443)  │                           │
└─────────────┘                           ▼
                                    ┌─────────┐
                                    │   db    │
                                    │ (non    │
                                    │ exposée)│
                                    └─────────┘
```

- **gateway** : SPA React + proxy REST + WebSocket (`/socket.io`) vers l'API.
- **api** et **db** : accessibles uniquement sur le réseau Docker interne.
- **Ports gateway** : `127.0.0.1` par défaut (`GATEWAY_BIND`). HTTP clair n’est jamais public.
- **Cloudflare** (recommandé) : proxy orange + WAF crawlers IA + UFW limité aux IPs Cloudflare (`DEPLOIEMENT-HOSTINGER.md` §1).
- **Web** : `VITE_API_URL=""` → appels same-origin (`/auth`, `/ventes`, …).
- **Seed démo** : désactivé (`SEED_ON_START=false`).

## Prérequis

- Docker + Docker Compose v2
- Nom de domaine (recommandé) ou IP fixe LAN
- Secrets forts (`openssl rand -hex 32`)

## Installation

```bash
cp .env.prod.example .env.prod
# Éditer .env.prod : POSTGRES_PASSWORD, JWT_SECRET, CORS_ORIGINS si mobile

docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
```

Vérification :

```bash
curl -s http://localhost/health
# {"status":"ok"}
```

Premier utilisateur : créer un compte SI via migration/seed **ponctuel** en
local, ou script d'administration — **ne pas** laisser `SEED_ON_START=true` en prod.

## TLS (HTTPS)

1. Placer les certificats dans `deploy/certs/` :
   - `fullchain.pem`
   - `privkey.pem`
2. Dans `.env.prod` :
   ```
   TLS_ENABLED=1
   ```
3. Redémarrer :
   ```bash
   docker compose --env-file .env.prod -f docker-compose.prod.yml up -d gateway
   ```

Let's Encrypt (exemple certbot standalone, arrêter gateway le temps du challenge) :

```bash
certbot certonly --standalone -d caisse.example.com
cp /etc/letsencrypt/live/caisse.example.com/fullchain.pem deploy/certs/
cp /etc/letsencrypt/live/caisse.example.com/privkey.pem deploy/certs/
```

Alternative : TLS terminé par un reverse-proxy externe (Cloudflare, Traefik) →
laisser `TLS_ENABLED=0` et exposer le port 80 du gateway en HTTP derrière le proxy.

## Client mobile (Expo)

L'app mobile appelle l'API directement. Configurer :

```
EXPO_PUBLIC_API_URL=https://caisse.example.com
```

Et dans `.env.prod` :

```
CORS_ORIGINS=https://caisse.example.com
```

## Sauvegarde (§6.7)

```bash
COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILE=.env.prod scripts/backup-postgres.sh
```

Planification cron (quotidien 02:00 UTC) :

```
0 2 * * * cd /opt/caisse-crm && COMPOSE_FILE=docker-compose.prod.yml COMPOSE_ENV_FILE=.env.prod scripts/backup-postgres.sh
```

Restauration testée : voir `BACKUP.md` et `scripts/restore-postgres.sh`.

## Différences dev vs prod

| | `docker-compose.yml` (dev) | `docker-compose.prod.yml` |
|---|---|---|
| Seed démo | `SEED_ON_START=true` | **false** |
| Ports API/DB | exposés (3000, 5433) | **non exposés** |
| Web | port 5173, API séparée | **passerelle unique**, bind `127.0.0.1` |
| CORS | ouvert (dev) | **restreint** |
| JWT / Postgres | défauts faibles | **obligatoires** |
| Process API | root possible | **non-root**, `cap_drop: ALL` |

## Checklist go-live

- [ ] `.env.prod` avec secrets uniques (jamais les valeurs d'exemple)
- [ ] `SEED_ON_START=false` confirmé
- [ ] TLS actif (Caddy / `TLS_ENABLED=1`) — jamais HTTP public
- [ ] `GATEWAY_BIND=127.0.0.1` (sauf TLS nginx standalone)
- [ ] Sauvegarde quotidienne + restauration testée sur base de test
- [ ] `CORS_ORIGINS` si mobile ou accès cross-origin
- [ ] SMTP / SMS si campagnes et alertes e-mail/SMS requis (sinon export CSV)
- [ ] Comptes utilisateurs réels créés (pas `demo-*`)
- [ ] Monitoring `/health` sur la passerelle
- [ ] `curl` depuis Internet sur `:8081` / `:8080` **refusé**

## CI

Le job `docker` de `.github/workflows/ci.yml` valide le build des images dev et prod.
