-- Verrou de concurrence (audit sécurité) : empêche deux SessionCaisse OUVERTE
-- simultanées sur le même tiroir, même en cas de requêtes concurrentes
-- passant toutes les deux la vérification applicative (findFirst) avant le
-- create. Un index unique partiel est la seule garantie fiable contre cette
-- race condition — la vérification applicative reste en place pour un
-- message d'erreur clair dans le cas non concurrent.
CREATE UNIQUE INDEX "session_caisse_ouverte_unique"
  ON "session_caisse" ("caisseId")
  WHERE "statut" = 'OUVERTE';
