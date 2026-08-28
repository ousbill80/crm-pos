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
type MouvementBudgetAchatDelegate = PrismaClient['mouvementBudgetAchat'];
type CommandeAchatVersionDelegate = PrismaClient['commandeAchatVersion'];
type MouvementStockDelegate = PrismaClient['mouvementStock'];

const ACTIONS_INTERDITES_JOURNAL_AUDIT: ReadonlySet<string> = new Set([
  'update',
  'updateMany',
  'upsert',
  'delete',
  'deleteMany',
]);

export function guardAppendOnlyDelegate<T extends object>(
  delegate: T,
  label: string,
): T {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        ACTIONS_INTERDITES_JOURNAL_AUDIT.has(prop)
      ) {
        return () =>
          Promise.reject(
            new Error(
              `${label} append-only : modification ou suppression interdite.`,
            ),
          );
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

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

export function guardMouvementBudgetAchatDelegate(
  delegate: MouvementBudgetAchatDelegate,
): MouvementBudgetAchatDelegate {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        ACTIONS_INTERDITES_JOURNAL_AUDIT.has(prop)
      ) {
        return () =>
          Promise.reject(
            new Error(
              'Grand livre budgétaire append-only : modification ou suppression interdite.',
            ),
          );
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

export function guardCommandeAchatVersionDelegate(
  delegate: CommandeAchatVersionDelegate,
): CommandeAchatVersionDelegate {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        ACTIONS_INTERDITES_JOURNAL_AUDIT.has(prop)
      ) {
        return () =>
          Promise.reject(
            new Error(
              'Avenant de commande append-only : modification ou suppression interdite.',
            ),
          );
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

export function guardMouvementStockDelegate(
  delegate: MouvementStockDelegate,
): MouvementStockDelegate {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        ACTIONS_INTERDITES_JOURNAL_AUDIT.has(prop)
      ) {
        return () =>
          Promise.reject(
            new Error(
              'Grand livre stock append-only : modification ou suppression interdite.',
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

type CaisseDelegate = PrismaClient['caisse'];

// Caisse.soldeCourant est une colonne de cache en lecture seule : le solde
// réel se recalcule toujours depuis le journal transactionCaisse
// (CaisseBalanceService.calculerSolde). Aucun service applicatif n'écrit
// jamais ce champ ; ce garde-fou l'interdit aussi au niveau Prisma, y
// compris pour un appel direct qui bypasserait les services (CLAUDE.md :
// « interdit UPDATE caisse SET solde = solde - x »).
function assertPasEcritureSolde(data: unknown): void {
  if (
    data !== null &&
    typeof data === 'object' &&
    Object.prototype.hasOwnProperty.call(data, 'soldeCourant')
  ) {
    throw new Error(
      'Grand livre append-only : Caisse.soldeCourant ne se stocke jamais directement, il se recalcule depuis transaction_caisse (CaisseBalanceService).',
    );
  }
}

export function guardCaisseDelegate(delegate: CaisseDelegate): CaisseDelegate {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (prop === 'update') {
        return async (args: Prisma.CaisseUpdateArgs) => {
          assertPasEcritureSolde(args.data);
          return target.update(args);
        };
      }
      if (prop === 'updateMany') {
        return async (args: Prisma.CaisseUpdateManyArgs) => {
          assertPasEcritureSolde(args.data);
          return target.updateMany(args);
        };
      }
      if (prop === 'upsert') {
        return async (args: Prisma.CaisseUpsertArgs) => {
          assertPasEcritureSolde(args.create);
          assertPasEcritureSolde(args.update);
          return target.upsert(args);
        };
      }
      return Reflect.get(target, prop, receiver) as unknown;
    },
  });
}

export function guardLettrageDelegate<T extends object>(
  delegate: T,
  label: string,
  allowedUpdateKeys: ReadonlySet<string>,
): T {
  return new Proxy(delegate, {
    get(target, prop, receiver) {
      if (
        typeof prop === 'string' &&
        (prop === 'delete' || prop === 'deleteMany' || prop === 'upsert')
      ) {
        return () =>
          Promise.reject(
            new Error(`${label} append-only : suppression ou upsert interdit.`),
          );
      }
      if (prop === 'update' || prop === 'updateMany') {
        return (args: { data?: Record<string, unknown> }) => {
          const keys = Object.keys(args.data ?? {});
          if (
            keys.length === 0 ||
            keys.some((key) => !allowedUpdateKeys.has(key))
          ) {
            throw new Error(
              `${label} append-only : seuls ${[...allowedUpdateKeys].join(', ')} peuvent être mis à jour.`,
            );
          }
          const fn = Reflect.get(target, prop, receiver) as (
            a: unknown,
          ) => Promise<unknown>;
          return fn.call(target, args) as Promise<unknown>;
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
      if (prop === 'mouvementBudgetAchat') {
        return guardMouvementBudgetAchatDelegate(
          Reflect.get(target, prop, receiver) as MouvementBudgetAchatDelegate,
        );
      }
      if (prop === 'commandeAchatVersion') {
        return guardCommandeAchatVersionDelegate(
          Reflect.get(target, prop, receiver) as CommandeAchatVersionDelegate,
        );
      }
      if (prop === 'mouvementStock') {
        return guardMouvementStockDelegate(
          Reflect.get(target, prop, receiver) as MouvementStockDelegate,
        );
      }
      if (
        prop === 'ecritureComptable' ||
        prop === 'mouvementTresorerie' ||
        prop === 'paiementFournisseur' ||
        prop === 'importReleveBancaire' ||
        prop === 'ligneReleveBancaire' ||
        prop === 'rapprochementBancaire' ||
        prop === 'accountingAiDecisionEvent' ||
        prop === 'accountingAiEvidence' ||
        prop === 'dotationImmobilisation'
      ) {
        return guardAppendOnlyDelegate(
          Reflect.get(target, prop, receiver) as object,
          'Fait comptable append-only',
        );
      }
      if (prop === 'shopFunnelEvent') {
        return guardAppendOnlyDelegate(
          Reflect.get(target, prop, receiver) as object,
          'Funnel shop append-only',
        );
      }
      if (prop === 'staffBriefingEnvoi') {
        return guardAppendOnlyDelegate(
          Reflect.get(target, prop, receiver) as object,
          'Briefing staff append-only',
        );
      }
      if (prop === 'ligneEcritureComptable') {
        return guardLettrageDelegate(
          Reflect.get(target, prop, receiver) as object,
          'Ligne d’écriture',
          new Set(['lettrage', 'dateLettrage']),
        );
      }
      if (prop === 'allocationPaiementFournisseur') {
        return guardLettrageDelegate(
          Reflect.get(target, prop, receiver) as object,
          'Allocation de paiement',
          new Set(['paiementId', 'lettrage']),
        );
      }
      if (prop === 'caisse') {
        return guardCaisseDelegate(
          Reflect.get(target, prop, receiver) as CaisseDelegate,
        );
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}
