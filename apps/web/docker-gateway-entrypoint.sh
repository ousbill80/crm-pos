#!/bin/sh
set -e

if [ "${TLS_ENABLED:-0}" = "1" ]; then
  if [ ! -f /etc/nginx/certs/fullchain.pem ] || [ ! -f /etc/nginx/certs/privkey.pem ]; then
    echo "TLS_ENABLED=1 mais certificats absents dans /etc/nginx/certs (fullchain.pem, privkey.pem)." >&2
    exit 1
  fi
  cp /etc/nginx/conf.d/nginx.prod.tls.conf /etc/nginx/conf.d/default.conf
else
  cp /etc/nginx/conf.d/nginx.prod.conf /etc/nginx/conf.d/default.conf
fi

exec nginx -g 'daemon off;'
