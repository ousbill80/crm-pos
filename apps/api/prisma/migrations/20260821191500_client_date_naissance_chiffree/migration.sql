-- Client.dateNaissance passe de DateTime à String pour porter le
-- ciphertext (AES-256-GCM), au même titre que contact/adresse (§6.7
-- chiffrement des données sensibles). Les valeurs existantes sont
-- converties en clair au format "YYYY-MM-DD" ; elles seront rechiffrées
-- automatiquement à la prochaine écriture de la fiche (le déchiffrement
-- applicatif tolère les valeurs en clair non encore migrées, voir
-- apps/api/src/prisma/field-crypto.ts).
ALTER TABLE "client"
  ALTER COLUMN "dateNaissance" TYPE TEXT
  USING to_char("dateNaissance", 'YYYY-MM-DD');
