# Déploiement Hostinger — MAJOR AUTO PARTS (KVM 2 · Ubuntu)

Domaine : **majorautoparts.shop**  
VPS : **KVM 2 Ubuntu** (à partager avec d’autres apps plus tard)

| Sous-domaine | Application |
|---|---|
| `www.majorautoparts.shop` (+ apex) | Boutique e-commerce PWA (`apps/shop`) |
| `crm.majorautoparts.shop` | Caisse / CRM / Finance (`apps/web` + API) |
| `pos.majorautoparts.shop` | POS web (même app CRM → `/pos`) |

```text
Internet
   │  :80 / :443
   ▼
Caddy (hôte Ubuntu) — HTTPS automatique Let’s Encrypt
   ├── www / apex     → 127.0.0.1:8080   (gateway-shop)
   ├── crm            → 127.0.0.1:8081   (gateway CRM)
   ├── pos            → 127.0.0.1:8081   (+ redir / → /pos)
   └── autre-app…     → ports libres 8090+
         │
         ▼
Docker Compose
   ├── stack CRM   (.env.prod  + docker-compose.prod.yml)
   └── stack Shop  (.env.shop  + docker-compose.shop.yml)
```

Les containers **ne publient pas** 80/443 : seul Caddy écoute le public.  
Ainsi tu peux ajouter d’autres apps sans conflit de ports.

---

## 0. Prérequis

- VPS Hostinger KVM 2, **Ubuntu 22.04 ou 24.04 LTS**
- Accès **root** SSH
- Domaine `majorautoparts.shop` chez Hostinger (zone DNS modifiable)
- Repo git de ce projet (ou archive) sur le serveur
- ~15–30 min pour le premier go-live

**RAM KVM 2 (8 Go)** : CRM + Shop ≈ 4–6 Go. Garde de la marge ; si tu ajoutes 2–3 apps lourdes → **KVM 4**.

---

## 1. DNS Hostinger

Dans **hPanel → Domaines → majorautoparts.shop → DNS** :

| Type | Nom | Valeur | TTL |
|---|---|---|---|
| A | `@` | `IP_DU_VPS` | 300 |
| A | `www` | `IP_DU_VPS` | 300 |
| A | `crm` | `IP_DU_VPS` | 300 |
| A | `pos` | `IP_DU_VPS` | 300 |

Supprime ou ignore les enregistrements A/AAAA Hostinger « parking » qui pointent ailleurs.  
Attends la propagation (souvent quelques minutes, parfois 1 h).

Vérifie depuis ton Mac :

```bash
dig +short majorautoparts.shop A
dig +short www.majorautoparts.shop A
dig +short crm.majorautoparts.shop A
dig +short pos.majorautoparts.shop A
```

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

# Pare-feu
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable
```

Crée un utilisateur deploy (recommandé) :

```bash
adduser deploy
usermod -aG docker,sudo deploy
# puis : ssh deploy@IP_DU_VPS
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

Crée `/etc/caddy/Caddyfile` :

```caddy
# Boutique e-commerce (PWA)
majorautoparts.shop, www.majorautoparts.shop {
	encode gzip
	reverse_proxy 127.0.0.1:8080
}

# Back-office Caisse / CRM
crm.majorautoparts.shop {
	encode gzip
	reverse_proxy 127.0.0.1:8081
}

# POS boutique → même passerelle CRM, page /pos
pos.majorautoparts.shop {
	encode gzip
	@root path /
	redir @root /pos permanent
	reverse_proxy 127.0.0.1:8081
}
```

```bash
caddy validate --config /etc/caddy/Caddyfile
systemctl reload caddy
systemctl status caddy
```

Caddy obtient les certificats **Let’s Encrypt** tout seul (ports 80/443 ouverts + DNS OK).

---

## 4. Déposer le code

```bash
mkdir -p /opt/apps
cd /opt/apps
git clone <URL_DU_REPO> caisse-crm
cd caisse-crm
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

# Ports internes — Caddy parle à 8081
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

## 8. Checklist go-live

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

# Mise à jour code
cd /opt/apps/caisse-crm
git pull
docker compose --env-file .env.prod -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.shop -f docker-compose.shop.yml up -d --build

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

## 11. Sécurité minimale

- SSH : clé uniquement, `PermitRootLogin no` (après user `deploy`)
- `fail2ban` actif
- Ne jamais exposer Postgres (`5432`) sur Internet
- Secrets uniquement dans `.env.prod` / `.env.shop` (hors git)
- Backups chiffrés / hors site

---

## Ordre du jour J1 (résumé)

1. DNS A → IP VPS  
2. Ubuntu + Docker + UFW  
3. Caddyfile (www / crm / pos)  
4. `.env.prod` + `.env.shop`  
5. `docker compose … up -d --build` (les 2 stacks)  
6. Tester les 3 URLs en HTTPS  
7. Configurer paiements + e-mails boutique  

Document lié : `DEPLOIEMENT-SHOP.md`, `BACKUP.md`, `.env.prod.example`, `.env.shop.example`.
