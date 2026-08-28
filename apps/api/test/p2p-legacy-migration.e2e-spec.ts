import { execFileSync } from 'node:child_process';
import {
  cpSync,
  mkdtempSync,
  mkdirSync,
  readdirSync,
  rmSync,
  copyFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

describe('P2P migration depuis les données Achats historiques', () => {
  it('conserve une facture existante et initialise ses champs P2P', async () => {
    const prismaDirectory = resolve(__dirname, '../prisma');
    const temporaryPrisma = mkdtempSync(
      join(tmpdir(), 'p2p-legacy-migration-'),
    );
    const temporaryMigrations = join(temporaryPrisma, 'migrations');
    const schemaPath = join(temporaryPrisma, 'schema.prisma');
    const migrationNames = readdirSync(
      join(prismaDirectory, 'migrations'),
    ).sort();
    const legacyCutoff = '20260822192154_produit_code_barres_genere';
    const container = await new PostgreSqlContainer('postgres:16-alpine')
      .withDatabase('test')
      .withUsername('test')
      .withPassword('test')
      .start();
    const databaseUrl = container.getConnectionUri();
    const prisma = new PrismaClient({
      datasources: { db: { url: databaseUrl } },
    });

    const deploy = () =>
      execFileSync(
        process.execPath,
        [
          resolve(__dirname, '../../../node_modules/prisma/build/index.js'),
          'migrate',
          'deploy',
          '--schema',
          schemaPath,
        ],
        {
          cwd: resolve(__dirname, '..'),
          env: { ...process.env, DATABASE_URL: databaseUrl },
          stdio: 'pipe',
        },
      );

    try {
      mkdirSync(temporaryMigrations);
      copyFileSync(join(prismaDirectory, 'schema.prisma'), schemaPath);
      for (const name of migrationNames.filter(
        (name) => name <= legacyCutoff,
      )) {
        cpSync(
          join(prismaDirectory, 'migrations', name),
          join(temporaryMigrations, name),
          { recursive: true },
        );
      }
      deploy();

      await prisma.$executeRawUnsafe(`
        INSERT INTO "role" ("id", "libelle", "niveauHabilitation")
        VALUES ('legacy-role', 'DAF', 1)
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "utilisateur"
          ("id", "nom", "prenom", "login", "passwordHash", "roleId")
        VALUES
          ('legacy-user', 'Legacy', 'User', 'legacy-user', 'hash', 'legacy-role')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "fournisseur" ("id", "nom")
        VALUES ('legacy-supplier', 'Fournisseur historique')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "facture_fournisseur"
          ("id", "numero", "referenceFournisseur", "fournisseurId", "montant", "createurId")
        VALUES
          ('legacy-invoice', 'FA-LEGACY-001', 'LEGACY-001', 'legacy-supplier', 1234.56, 'legacy-user')
      `);

      for (const name of migrationNames.filter((name) => name > legacyCutoff)) {
        cpSync(
          join(prismaDirectory, 'migrations', name),
          join(temporaryMigrations, name),
          { recursive: true },
        );
      }
      deploy();

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          statut: string;
          montant: { toString(): string };
          statutRapprochement: string;
          devise: string;
          typeDocument: string;
        }>
      >(
        `SELECT "id", "statut"::text, "montant", "statutRapprochement"::text,
                "devise", "typeDocument"::text
         FROM "facture_fournisseur" WHERE "id" = 'legacy-invoice'`,
      );

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        id: 'legacy-invoice',
        statut: 'BROUILLON',
        statutRapprochement: 'A_RAPPROCHER',
        devise: 'XOF',
        typeDocument: 'FACTURE',
      });
      expect(rows[0].montant.toString()).toBe('1234.56');
    } finally {
      await prisma.$disconnect();
      await container.stop();
      rmSync(temporaryPrisma, { recursive: true, force: true });
    }
  }, 120_000);
});
