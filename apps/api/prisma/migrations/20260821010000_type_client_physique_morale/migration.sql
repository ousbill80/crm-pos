-- Type de fiche client : personne physique ou morale (§6.6).
CREATE TYPE "TypeClient" AS ENUM ('PHYSIQUE', 'MORALE');

ALTER TABLE "client" ADD COLUMN "typeClient" "TypeClient" NOT NULL DEFAULT 'PHYSIQUE';

-- Interlocuteur optionnel pour une personne morale.
ALTER TABLE "client" ALTER COLUMN "prenom" DROP NOT NULL;
