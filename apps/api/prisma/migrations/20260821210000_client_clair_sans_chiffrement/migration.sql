-- §6.7 décision produit : fiches client en clair au repos.
-- contactHash (HMAC recherche) n’est plus utiliséé (recherche plain-text).
-- Le backfill de déchiffrement AES-GCM est géré au démarrage API
-- (dechiffrerClientsAuReposSiNecessaire) tant que des ciphertext restent.

DROP INDEX IF EXISTS "client_contactHash_idx";
ALTER TABLE "client" DROP COLUMN IF EXISTS "contactHash";
