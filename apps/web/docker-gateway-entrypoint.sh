#!/bin/sh
set -e

# Les templates ne doivent PAS rester dans conf.d (nginx charge *.conf).
# 00-http.conf (rate-limit, real_ip, server_tokens) reste en place.
mkdir -p /tmp/nginx-templates
if [ -f /etc/nginx/conf.d/nginx.prod.conf ]; then
  mv /etc/nginx/conf.d/nginx.prod.conf /tmp/nginx-templates/
fi
if [ -f /etc/nginx/conf.d/nginx.prod.tls.conf ]; then
  mv /etc/nginx/conf.d/nginx.prod.tls.conf /tmp/nginx-templates/
fi
rm -f /etc/nginx/conf.d/default.conf

if [ "${TLS_ENABLED:-0}" = "1" ]; then
  if [ ! -f /etc/nginx/certs/fullchain.pem ] || [ ! -f /etc/nginx/certs/privkey.pem ]; then
    echo "TLS_ENABLED=1 mais certificats absents dans /etc/nginx/certs (fullchain.pem, privkey.pem)." >&2
    exit 1
  fi
  cp /tmp/nginx-templates/nginx.prod.tls.conf /etc/nginx/conf.d/default.conf
else
  cp /tmp/nginx-templates/nginx.prod.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
