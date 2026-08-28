# Déploiement Hostinger — MAJOR AUTO PARTS (KVM 2 · Ubuntu)

Domaine : **majorautoparts.shop**  
VPS : **KVM 2 Ubuntu** (à partager avec d’autres apps plus tard)

| Sous-domaine | Application | Env |
|---|---|---|
| `www.majorautoparts.shop` (+ apex) | Boutique e-commerce PWA | **prod** |
| `crm.majorautoparts.shop` | Caisse / CRM / Finance | **prod** |
| `pos.majorautoparts.shop` | POS web (`/pos`) | **prod** |
| `staging.majorautoparts.shop` | Boutique (tests, sandbox) | **staging** |
| `crm-staging.majorautoparts.shop` | CRM (seed démo) | **staging** |
| `pos-staging.majorautoparts.shop` | POS tests | **staging** |

```text
Internet
   │  HTTPS
   ▼
Cloudflare (proxy orange) — WAF, TLS, blocage crawlers IA
   │  uniquement plages CF → VPS :443
   ▼
Caddy (hôte Ubuntu) — 127.0.0.1
   ├── www / apex          → 127.0.0.1:8080   shop prod
   ├── crm / pos           → 127.0.0.1:8081   CRM prod
   ├── staging             → 127.0.0.1:8082   shop staging
   ├── crm-staging / pos-staging → 127.0.0.1:8083   CRM staging
         │
         ▼
Docker Compose
   ├── caisse-prod     (.env.prod  + docker-compose.prod.yml)
   ├── caisse-shop     (.env.shop  + docker-compose.shop.yml)
   └── caisse-staging  (.env.staging + docker-compose.staging.yml)
        1 Postgres + 1 API monolith + 2 gateways (~1,3 Go)
```

L’IP du VPS n’est **pas** dans le DNS public (proxy Cloudflare).  
80/443 du VPS n’acceptent que les plages Cloudflare (`deploy/cloudflare/ufw-allow-cloudflare.sh`).  
Les containers Docker n’écoutent pas 80/443 public.

---

## 0. Prérequis

- VPS Hostinger KVM 2, **Ubuntu 22.04 ou 24.04 LTS**
- Accès **root** SSH
- Domaine `majorautoparts.shop` chez Hostinger (zone DNS modifiable)
- Repo git de ce projet (ou archive) sur le serveur
- ~15–30 min pour le premier go-live

**RAM KVM 2 (8 Go)** : prod CRM + prod shop ≈ 4–6 Go, staging léger ≈ 1,3 Go. Si `docker stats` montre moins de 1 Go libre → **KVM 4**.

---

## 1. DNS + Cloudflare (obligatoire)

L’origine (IP VPS) ne doit **jamais** être joignable directement : sinon les bots IA contournent Cloudflare.

### 1.1 Compte et nameservers

1. Compte [Cloudflare](https://dash.cloudflare.com) → **Add a site** → `majorautoparts.shop` (plan **Free** suffit).
2. Cloudflare affiche 2 nameservers (`xxx.ns.cloudflare.com`).
3. Chez **Hostinger → Domaines → majorautoparts.shop → Nameservers** : coller ceux de Cloudflare (plus la zone DNS Hostinger).
4. Attendre que le domaine soit **Active** dans Cloudflare (souvent 15 min–24 h).

### 1.2 Enregistrements DNS (proxy **orange**)

SSL/TLS → Overview : mode **Full (strict)**.

| Type | Nom | Contenu | Proxy |
|---|---|---|---|
| A | `@` | `IP_DU_VPS` | **Proxied** (nuage orange) |
| A | `www` | `IP_DU_VPS` | **Proxied** |
| A | `crm` | `IP_DU_VPS` | **Proxied** |
| A | `pos` | `IP_DU_VPS` | **Proxied** |
| A | `staging` | `IP_DU_VPS` | **Proxied** |
| A | `crm-staging` | `IP_DU_VPS` | **Proxied** |
| A | `pos-staging` | `IP_DU_VPS` | **Proxied** |

Vérifie : `dig +short www.majorautoparts.shop A` doit renvoyer une **IP Cloudflare**, pas l’IP du VPS.

SSL/TLS → Edge Certificates : **Always Use HTTPS** = on.  
Network : **WebSockets** = on (trésorerie temps réel).

### 1.3 WAF — bloquer les crawlers IA

1. **Security → Bots** : activer **Bot Fight Mode** (Free). Si tu vois **Block AI bots / AI scrapers**, l’activer.
2. **Security → WAF → Custom rules** : coller `deploy/cloudflare/waf-ai-bots.txt` (action **Block**).
3. 2ᵉ règle : hostname `crm` / `pos` / `*-staging` + User-Agent `bot|spider|crawler` → **Block** (même fichier, 2ᵉ expression).

Ne pas activer « I’m Under Attack » sur `pos.` / `crm.` (ça casse la caisse).

### 1.4 Fermer le VPS aux IPs hors Cloudflare

**Après** que HTTPS fonctionne via Cloudflare :

```bash
sudo /opt/apps/caisse-crm/deploy/cloudflare/ufw-allow-cloudflare.sh
```

Contrôle depuis un réseau externe (4G, pas le VPS) :

```bash
curl -I --connect-timeout 5 http://IP_DU_VPS/
# doit échouer (timeout). Le site passe uniquement par https://www.majorautoparts.shop
```

Paystack webhooks : URL publique Cloudflare (`https://www.majorautoparts.shop/shop/webhooks/paystack`), pas l’IP.

---

---

## 2. Préparer le VPS Ubuntu

```bash
ssh root@IP_DU_VPS

apt update && apt upgrade -y
apt install -y ca-certificates curl git ufw fail2ban

# Docker
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version

# Pare-feu provisoire (SSH + HTTP/S le temps d’activer Cloudflare).
# Ensuite : sudo ./deploy/cloudflare/ufw-allow-cloudflare.sh  (80/443 = CF seulement)
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Mises à jour de sécurité automatiques
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades

systemctl enable --now fail2ban
```

Crée un utilisateur deploy (recommandé) **avant** de couper root SSH :

```bash
adduser deploy
usermod -aG docker,sudo deploy
mkdir -p /home/deploy/.ssh
# coller ta clé publique :
# nano /home/deploy/.ssh/authorized_keys
chmod 700 /home/deploy/.ssh
chmod 600 /home/deploy/.ssh/authorized_keys
chown -R deploy:deploy /home/deploy/.ssh
# Tester `ssh deploy@IP` depuis un autre terminal, PUIS durcir sshd (étape 4).
```

---

## 3. Installer Caddy (reverse proxy + HTTPS)

```bash
apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
  | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
  | tee /etc/apt/sources.list.d/caddy-stable.list
apt update && apt install -y caddy
```

Le Caddyfile (HSTS) se copie **après** le clone, étape 4.

Caddy obtient les certificats **Let’s Encrypt** (via le proxy Cloudflare, HTTP-01).  
SSL Cloudflare = **Full (strict)**.

---

## 4. Déposer le code

```bash
mkdir -p /opt/apps
cd /opt/apps
git clone <URL_DU_REPO> caisse-crm
cd caisse-crm

# Reverse-proxy + HSTS + jails SSH
cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile
# adapter l’e-mail ACME dans le Caddyfile si besoin
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy

cp deploy/fail2ban/jail.local /etc/fail2ban/jail.local
systemctl restart fail2ban

# Seulement après un login SSH réussi en tant que deploy :
cp deploy/sshd/hardening.conf /etc/ssh/sshd_config.d/hardening.conf
sshd -t && systemctl reload ssh
```

(Ou `scp` / `rsync` depuis ta machine.)

---

## 5. Secrets CRM (`.env.prod`)

```bash
cd /opt/apps/caisse-crm
cp .env.prod.example .env.prod
nano .env.prod
```

Valeurs minimales :

```env
POSTGRES_USER=caisse
POSTGRES_PASSWORD=<openssl rand -hex 24>
POSTGRES_DB=caisse_crm

JWT_SECRET=<openssl rand -hex 32>

# Mobile Expo / outils externes (sinon laisser vide si web only same-origin)
CORS_ORIGINS=https://crm.majorautoparts.shop,https://pos.majorautoparts.shop

# Ports internes — Caddy parle à 8081 (jamais publiés sur 0.0.0.0)
GATEWAY_BIND=127.0.0.1
HTTP_PORT=8081
HTTPS_PORT=8443
TLS_ENABLED=0
TLS_CERTS_DIR=./deploy/certs
```

Génère les secrets :

```bash
openssl rand -hex 24
openssl rand -hex 32
```

---

## 6. Secrets Shop (`.env.shop`)

```bash
cp .env.shop.example .env.shop
nano .env.shop
```

```env
POSTGRES_USER=caisse
POSTGRES_PASSWORD=<autre secret fort>
POSTGRES_DB=caisse_crm

JWT_SECRET_SHOP=<openssl rand -hex 32>
SHOP_PANIER_SECRET=<openssl rand -hex 32>

SHOP_BIND=127.0.0.1
SHOP_HTTP_PORT=8080
SHOP_HTTPS_PORT=8444
SHOP_CORS_ORIGINS=https://www.majorautoparts.shop,https://majorautoparts.shop
SHOP_PUBLIC_URL=https://www.majorautoparts.shop

PAYSTACK_SECRET_KEY=sk_live_xxx
PAYSTACK_PUBLIC_KEY=pk_live_xxx
ORANGE_MONEY_ENABLED=0
WAVE_ENABLED=0

EMAIL_PROVIDER=resend
RESEND_API_KEY=re_xxx
SHOP_EMAIL_FROM="MAJOR AUTO PARTS <noreply@majorautoparts.shop>"
SHOP_ADMIN_EMAIL=admin@majorautoparts.shop

TLS_ENABLED=0
TLS_CERTS_DIR=./deploy/certs-shop
```

> **Note KVM 2** : shop et CRM ont chacun leur Postgres dans les compose actuels (isolation Option A). Surveille la RAM (`htop` / `docker stats`). Consolidation DB plus tard possible si besoin.

---

## 7. Lancer les stacks Docker

```bash
cd /opt/apps/caisse-crm

# CRM + API + Postgres
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build

# Boutique + api-shop + Postgres shop
docker compose --env-file .env.shop -f docker-compose.shop.yml up -d --build

docker compose --env-file .env.prod -f docker-compose.prod.yml ps
docker compose --env-file .env.shop -f docker-compose.shop.yml ps
```

Santé locale :

```bash
curl -sS http://127.0.0.1:8081/health
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8080/
```

Santé publique (après DNS + Caddy) :

```bash
curl -I https://www.majorautoparts.shop
curl -I https://crm.majorautoparts.shop/login
curl -I https://pos.majorautoparts.shop
```

---

## 7b. Staging (tests avant prod)

**Ce n’est pas de la prod.** Base séparée, comptes démo, Paystack **sandbox**.  
Une seule API Nest (monolithe) pour CRM + boutique — autorisé uniquement en staging.

```bash
cd /opt/apps/caisse-crm
cp .env.staging.example .env.staging
nano .env.staging   # secrets DISTINCTS de la prod ; PAYSTACK sk_test_ uniquement
chmod +x scripts/deploy-staging.sh scripts/deploy-prod.sh
./scripts/deploy-staging.sh
```

Santé locale :

```bash
curl -sS http://127.0.0.1:8083/health
curl -sS -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8082/health
```

URLs (après DNS + `cp deploy/caddy/Caddyfile /etc/caddy/Caddyfile && systemctl reload caddy`) :

| URL | App |
|---|---|
| https://staging.majorautoparts.shop | Boutique test |
| https://crm-staging.majorautoparts.shop | CRM test (`demo-dg` / `MotDePasse!123`) |
| https://pos-staging.majorautoparts.shop | POS test |

Puis **mettre à jour Caddy** si le fichier serveur est encore l’ancienne version (sans staging) :

```bash
cp /opt/apps/caisse-crm/deploy/caddy/Caddyfile /etc/caddy/Caddyfile
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
```

### Déploiement continu → staging seulement

`git push` sur `main` : CI (lint, tests, images) puis, **si tu l’actives**, déploiement auto du staging. **La prod n’est jamais déployée toute seule.**

1. Sur le VPS, clé SSH **déploy** (pas le mot de passe root) :

```bash
# machine de deploy (ou root) : créer une clé dédiée GitHub → VPS
ssh-keygen -t ed25519 -f /tmp/gh-staging -N "" -C "github-staging"
cat /tmp/gh-staging.pub >> /home/deploy/.ssh/authorized_keys   # ou /root/.ssh/authorized_keys
# Coller le CONTENU PRIVÉ de /tmp/gh-staging dans GitHub (une fois), puis `shred -u /tmp/gh-staging`
```

2. GitHub repo **ousbill80/crm-pos** → Settings :
   - **Variables** : `STAGING_DEPLOY` = `true`
   - **Secrets** :
     - `STAGING_HOST` = `72.62.176.109`
     - `STAGING_USER` = `deploy` (ou `root`)
     - `STAGING_SSH_KEY` = clé privée ed25519
   - **Environments** : créer `staging` (optionnel, pour protéger le job)

3. Améliorations ensuite :

```text
push main → CI verte → staging mis à jour automatiquement
tu testes staging. / crm-staging. / pos-staging.
OK → sur le VPS : git pull && ./scripts/deploy-prod.sh
```

Prod = **manuel** (`scripts/deploy-prod.sh`) après validation staging.

---

## 8. Checklist go-live

### Staging (`staging` / `crm-staging` / `pos-staging`)
- [ ] DNS A des 3 sous-domaines
- [ ] `.env.staging` secrets ≠ prod, Paystack `sk_test_`
- [ ] Login `demo-dg` / `MotDePasse!123` sur crm-staging
- [ ] Catalogue / checkout sandbox sur staging
- [ ] CD GitHub activé (`STAGING_DEPLOY=true` + clé SSH)

### Boutique `www`
- [ ] Catalogue visible, panier, checkout
- [ ] PWA installable (HTTPS OK)
- [ ] Webhooks Paystack → `https://www.majorautoparts.shop/shop/webhooks/paystack` (ou URL api-shop proxifiée)
- [ ] `ParametreShop.shopActif = true`, produits `visibleWeb`
- [ ] E-mails Resend : domaine `majorautoparts.shop` vérifié

### CRM `crm`
- [ ] Login comptes démo / comptes réels
- [ ] Commandes web, stocks, compta
- [ ] Seed **désactivé** (`SEED_ON_START=false`)

### POS `pos`
- [ ] Redirection vers `/pos`
- [ ] Encaissement + session caisse OK

### Mobile
- [ ] API URL = `https://crm.majorautoparts.shop` (ou gateway same-origin)
- [ ] `CORS_ORIGINS` contient l’origine mobile si besoin

### Sauvegardes
- [ ] Cron journalier : `scripts/backup-postgres.sh` (voir `BACKUP.md`)
- [ ] Copie des dumps hors du VPS

---

## 9. Commandes utiles

```bash
# Logs
docker compose --env-file .env.prod -f docker-compose.prod.yml logs -f --tail=100
docker compose --env-file .env.shop -f docker-compose.shop.yml logs -f --tail=100
docker compose --env-file .env.staging -f docker-compose.staging.yml logs -f --tail=100

# Mise à jour staging (ou laisser la CI le faire)
cd /opt/apps/caisse-crm && git pull && ./scripts/deploy-staging.sh

# Mise à jour prod (après tests staging)
cd /opt/apps/caisse-crm && git pull && ./scripts/deploy-prod.sh

# RAM / CPU
docker stats
htop
```

---

## 10. Ajouter une autre app plus tard

1. DNS : `autre.majorautoparts.shop` → A → IP VPS  
2. App Docker sur un port libre, ex. `127.0.0.1:8090`  
3. Bloc Caddy :

```caddy
autre.majorautoparts.shop {
	encode gzip
	reverse_proxy 127.0.0.1:8090
}
```

4. `systemctl reload caddy`  
5. Si RAM < 1,5 Go libre → upgrade **KVM 4**

---

## 11. Sécurité (à vérifier après go-live)

**Réseau**
- [ ] DNS `dig +short www.majorautoparts.shop` = IP **Cloudflare**, pas le VPS
- [ ] Proxy orange sur tous les A (`www` `crm` `pos` `staging`…)
- [ ] `ufw-allow-cloudflare.sh` : 80/443 seulement depuis Cloudflare
- [ ] `curl -I http://IP_PUBLIQUE/` depuis l’extérieur → timeout
- [ ] `ss -tlnp` : 8080–8083 en `127.0.0.1`, **pas** `0.0.0.0`
- [ ] Postgres 5432 non publié

**Crawlers IA**
- [ ] `curl -A GPTBot -I https://www.majorautoparts.shop` → **403**
- [ ] `curl -A Googlebot -I https://www.majorautoparts.shop` → **200** (SEO boutique)
- [ ] `curl -A Googlebot -I https://crm.majorautoparts.shop` → **403**
- [ ] WAF Cloudflare + Bot Fight Mode

**TLS**
- [ ] Mode Cloudflare **Full (strict)**
- [ ] HSTS (`curl -sI https://crm.majorautoparts.shop | grep -i strict`)

**Accès**
- [ ] SSH clé uniquement, root refusé, user `deploy`
- [ ] fail2ban actif (`fail2ban-client status sshd`)
- [ ] unattended-upgrades actif

**Application**
- [ ] Secrets uniques (jamais les valeurs `change-me` des exemples)
- [ ] `SEED_ON_START=false` (déjà forcé dans les compose prod)
- [ ] Comptes `demo-*` absents
- [ ] `SHOP_PANIER_SECRET` et `JWT_SECRET_SHOP` distincts de `JWT_SECRET`
- [ ] Sauvegarde quotidienne **hors VPS** (`BACKUP.md`)

Ne pas exposer l’API ni la DB. Le JWT CRM reste 24 h ; le login est limité à 5/min + verrouillage 5 échecs.

---

## Ordre du jour J1 (résumé)

1. Cloudflare (NS Hostinger → CF, proxy orange, Full strict, WAF IA)  
2. Ubuntu + Docker + UFW  
3. Caddyfile (prod + staging)  
4. `.env.prod` + `.env.shop` + `.env.staging`  
5. `docker compose … up` prod, puis `./scripts/deploy-staging.sh`  
6. Tester les 3 URLs **staging**, puis les 3 URLs **prod**  
7. `ufw-allow-cloudflare.sh` + test 403 GPTBot  
8. CD GitHub + paiements live **uniquement** en prod  

Document lié : `DEPLOIEMENT-SHOP.md`, `BACKUP.md`, `.env.prod.example`, `.env.shop.example`, `.env.staging.example`.
