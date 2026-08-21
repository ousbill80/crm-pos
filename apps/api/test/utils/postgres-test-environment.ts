import { execSync } from 'node:child_process';
import {
  PostgreSqlContainer,
  StartedPostgreSqlContainer,
} from '@testcontainers/postgresql';
import { PrismaService } from '../../src/prisma/prisma.service';

// Harnais de test d'intégration : démarre un PostgreSQL éphémère réel via
// Testcontainers, applique les migrations Prisma, et fournit un client
// connecté. Cohérent avec la règle CLAUDE.md « zéro mock, y compris en
// test » — aucune base en mémoire ou simulée n'est utilisée ici.
//
// Utilise PrismaService (pas PrismaClient brut) : les specs e2e overrident
// le provider PrismaService de Nest avec cette instance, donc les
// garde-fous d'immutabilité du grand livre append-only (ledger-guard.ts)
// doivent rester actifs ici pour que les tests reflètent le comportement
// réel de l'application.
export class PostgresTestEnvironment {
  private container?: StartedPostgreSqlContainer;
  prisma!: PrismaService;

  async start(): Promise<void> {
    this.container = await new PostgreSqlContainer(
      'postgres:16-alpine',
    ).start();

    const databaseUrl = this.container.getConnectionUri();
    process.env.DATABASE_URL = databaseUrl;

    execSync('npx prisma migrate deploy', {
      cwd: `${__dirname}/../..`,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'inherit',
    });

    this.prisma = new PrismaService();
    await this.prisma.$connect();
  }

  async stop(): Promise<void> {
    await this.prisma?.$disconnect();
    await this.container?.stop();
  }
}
