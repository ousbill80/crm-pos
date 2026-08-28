#!/bin/sh
# Autorise 80/443 uniquement depuis les plages Cloudflare.
# SSH reste ouvert (22). À lancer APRÈS proxy orange + SSL Full (strict).
#
#   sudo ./deploy/cloudflare/ufw-allow-cloudflare.sh
#
# Met à jour les plages : https://www.cloudflare.com/ips/

set -e

if [ "$(id -u)" -ne 0 ]; then
  echo "Exécuter en root (sudo)." >&2
  exit 1
fi

echo "Téléchargement des plages Cloudflare…"
CF4=$(curl -fsSL https://www.cloudflare.com/ips-v4)
CF6=$(curl -fsSL https://www.cloudflare.com/ips-v6)

if [ -z "$CF4" ]; then
  echo "Impossible de récupérer ips-v4." >&2
  exit 1
fi

# Retirer d’éventuelles règles HTTP/S trop larges
ufw delete allow 80/tcp 2>/dev/null || true
ufw delete allow 443/tcp 2>/dev/null || true
ufw delete allow 'Nginx Full' 2>/dev/null || true
ufw delete allow 'Caddy' 2>/dev/null || true

# Commentaire ufw : on recrée les allow par CIDR
echo "$CF4" | while read -r cidr; do
  [ -n "$cidr" ] || continue
  ufw allow proto tcp from "$cidr" to any port 80 comment 'Cloudflare'
  ufw allow proto tcp from "$cidr" to any port 443 comment 'Cloudflare'
done

echo "$CF6" | while read -r cidr; do
  [ -n "$cidr" ] || continue
  ufw allow proto tcp from "$cidr" to any port 80 comment 'Cloudflare'
  ufw allow proto tcp from "$cidr" to any port 443 comment 'Cloudflare'
done

ufw allow OpenSSH
ufw --force enable
ufw reload
echo "OK — 80/443 = Cloudflare uniquement. SSH inchangé."
ufw status numbered | head -80
