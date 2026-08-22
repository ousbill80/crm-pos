# Caisse POS mobile (Expo)

Périmètre : caisse boutique + circuit trésorerie léger + file hors-ligne SQLite (§6.7). Pas de CRM complet hors ligne.

## Lancer

```bash
# API locale (port 3000) puis :
cd apps/mobile
EXPO_PUBLIC_API_URL="http://<IP-LAN-Mac>:3000" pnpm start
```

Ouvrir `exp://<IP-LAN-Mac>:8081` dans Expo Go (même Wi‑Fi). Simulateur iOS : Xcode complet requis.

## Comptes démo

- `demo-pos-caissier` / `MotDePasse!123` — POS
- `demo-pos-temoin` — confirmateur ouverture/clôture

## Hors-ligne

Ventes (et versements) en file SQLite ; sync auto à la reconnexion (NetInfo), au retour app, et bouton Sync.
