// Garde-fou d'immutabilité du grand livre append-only (CLAUDE.md).
//
// journalAudit et transactionCaisse ne doivent jamais être modifiés ou
// supprimés rétroactivement, y compris par un appel Prisma direct qui
// bypasserait les services applicatifs (AuditService, TransactionsService).
// Prisma 6 n'expose plus $use (middleware) — implémenté en Proxy sur les
// delegates de modèle plutôt qu'en Client Extension pour que PrismaService
// reste une instance de PrismaClient ordinaire, injectable sans changement
// ailleurs dans l'application.

import type { Prisma, PrismaClient } from '@prisma/client';

type JournalAuditDelegate = PrismaClient['journalAudit'];
type TransactionCaisseDelegate = PrismaClient['transactionCaisse'];

const ACTIONS_INTERDITES_JOURNAL_AUDIT: ReadonlySet<string> = new Set([
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

export function guardJournalAuditDelegate(
  delegate: JournalAuditDelegate,
): JournalAuditDelegate {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        ACTIONS_INTERDITES_JOURNAL_AUDIT.has(prop)
      ) {
        return () =>
          Promise.reject(
            new Error(
              "Journal d'audit append-only : modification ou suppression interdite.",
            ),
          );
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

const ACTIONS_TOUJOURS_INTERDITES_TRANSACTION_CAISSE: ReadonlySet<string> =
  new Set(['delete', 'deleteMany', 'upsert', 'updateMany']);

export function guardTransactionCaisseDelegate(
  delegate: TransactionCaisseDelegate,
): TransactionCaisseDelegate {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        ACTIONS_TOUJOURS_INTERDITES_TRANSACTION_CAISSE.has(prop)
      ) {
        return () =>
          Promise.reject(
            new Error(
              `Grand livre append-only : "${prop}" interdit sur transaction_caisse.`,
            ),
          );
      }

      if (prop === 'update') {
        return async (args: Prisma.TransactionCaisseUpdateArgs) => {
          if (Object.prototype.hasOwnProperty.call(args.data, 'montant')) {
            throw new Error(
              'Grand livre append-only : le montant d’une transaction_caisse est immuable après création.',
            );
          }
          const actuelle = await target.findUnique({ where: args.where });
          if (actuelle?.statut === 'VALIDEE') {
            throw new Error(
              'Grand livre append-only : une transaction_caisse VALIDEE est un état terminal, non modifiable.',
            );
          }
          return target.update(args);
        };
      }

      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

export function guardLedgerTransactionClient<T extends object>(tx: T): T {
  return new Proxy(tx, {
    get(target, prop, receiver) {
      if (prop === 'journalAudit') {
        return guardJournalAuditDelegate(
          Reflect.get(target, prop, receiver) as JournalAuditDelegate,
        );
      }
      if (prop === 'transactionCaisse') {
        return guardTransactionCaisseDelegate(
          Reflect.get(target, prop, receiver) as TransactionCaisseDelegate,
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
