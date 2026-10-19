import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { AuthService } from '../src/auth/auth.service';

/**
 * Bootstrap du premier compte DIRECTION_GENERALE en prod, où SEED_ON_START=false
 * et aucun compte demo-* n'existe (DEPLOIEMENT-HOSTINGER.md §8). Écritures Prisma
 * directes car il n'y a par définition encore aucun utilisateur pour s'authentifier
 * contre un endpoint /users.
 *
 * Usage (sur le VPS, depuis /opt/apps/caisse-crm) :
 *   pnpm --filter api create:super-admin -- \
 *     --login=dg.prod --password='...' --nom=... --prenom=... [--email=...]
 */

loadEnv({ path: resolve(__dirname, '../../../.env.prod') });
loadEnv({ path: resolve(__dirname, '../.env') });

const ROLE_LIBELLE = 'DIRECTION_GENERALE';
const ROLE_NIVEAU_HABILITATION = 0;

function parseArgs(): {
  login: string;
  password: string;
  nom: string;
  prenom: string;
  email?: string;
} {
  const args = new Map<string, string>();
  for (const arg of process.argv.slice(2)) {
    const match = /^--([a-z]+)=(.*)$/.exec(arg);
    if (match) args.set(match[1], match[2]);
  }
  const login = args.get('login');
  const password = args.get('password');
  const nom = args.get('nom');
  const prenom = args.get('prenom');
  if (!login || !password || !nom || !prenom) {
    throw new Error(
      'Arguments requis : --login=... --password=... --nom=... --prenom=... [--email=...]',
    );
  }
  if (password.length < 8) {
    throw new Error('Le mot de passe doit contenir au moins 8 caractères.');
  }
  return { login, password, nom, prenom, email: args.get('email') };
}

async function main() {
  const { login, password, nom, prenom, email } = parseArgs();
  const prisma = new PrismaClient();
  try {
    const existant = await prisma.utilisateur.findUnique({ where: { login } });
    if (existant) {
      throw new Error(
        `Le login "${login}" existe déjà. Utilise la réinitialisation de mot de passe habituelle plutôt que ce script.`,
      );
    }

    const role = await prisma.role.upsert({
      where: { libelle: ROLE_LIBELLE },
      update: {},
      create: {
        libelle: ROLE_LIBELLE,
        niveauHabilitation: ROLE_NIVEAU_HABILITATION,
      },
    });

    const passwordHash = await AuthService.hashPassword(password);
    const utilisateur = await prisma.utilisateur.create({
      data: {
        login,
        passwordHash,
        nom,
        prenom,
        email,
        actif: true,
        boutiqueId: null,
        roleId: role.id,
        mustChangePassword: true,
      },
    });

    console.log(
      `Compte DIRECTION_GENERALE créé : login="${utilisateur.login}" id=${utilisateur.id}. ` +
        'mustChangePassword=true : le mot de passe fourni devra être changé à la première connexion.',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
