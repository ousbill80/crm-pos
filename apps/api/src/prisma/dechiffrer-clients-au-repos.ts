/**
 * Déchiffrement one-shot des fiches client encore chiffrées (legacy).
 * Décision produit §6.7 : mots de passe hashés ; fiches client en clair au repos.
 * La clé CLIENT_DATA_ENCRYPTION_KEY n’est requise que s’il reste du ciphertext.
 */
import type { PrismaClient } from '@prisma/client';
import {
  cleChiffrementConfiguree,
  dechiffrerNullable,
  estFormatChiffre,
} from './field-crypto';

type LigneClientBrute = {
  id: string;
  contact: string | null;
  adresse: string | null;
  dateNaissance: string | null;
};

function champChiffre(valeur: string | null): boolean {
  return typeof valeur === 'string' && estFormatChiffre(valeur);
}

export async function dechiffrerClientsAuReposSiNecessaire(
  prisma: PrismaClient,
): Promise<{ examines: number; misAJour: number }> {
  const lignes = await prisma.$queryRaw<LigneClientBrute[]>`
    SELECT id, contact, adresse, "dateNaissance" AS "dateNaissance"
    FROM client
  `;

  const aDechiffrer = lignes.filter(
    (l) =>
      champChiffre(l.contact) ||
      champChiffre(l.adresse) ||
      champChiffre(l.dateNaissance),
  );

  if (aDechiffrer.length === 0) {
    return { examines: lignes.length, misAJour: 0 };
  }

  if (!cleChiffrementConfiguree()) {
    console.warn(
      `[crm] ${aDechiffrer.length} fiche(s) client encore chiffrée(s) : ` +
        'définir CLIENT_DATA_ENCRYPTION_KEY une dernière fois pour le backfill clair, puis la retirer.',
    );
    return { examines: lignes.length, misAJour: 0 };
  }

  let misAJour = 0;
  for (const ligne of aDechiffrer) {
    const contact = dechiffrerNullable(ligne.contact) ?? null;
    const adresse = dechiffrerNullable(ligne.adresse) ?? null;
    const dateNaissance = dechiffrerNullable(ligne.dateNaissance) ?? null;
    await prisma.$executeRaw`
      UPDATE client
      SET contact = ${contact},
          adresse = ${adresse},
          "dateNaissance" = ${dateNaissance}
      WHERE id = ${ligne.id}
    `;
    misAJour += 1;
  }

  return { examines: lignes.length, misAJour };
}
