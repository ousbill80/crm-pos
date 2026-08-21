import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { UnwrapTuple } from '@prisma/client/runtime/library';
import {
  guardJournalAuditDelegate,
  guardLedgerTransactionClient,
  guardTransactionCaisseDelegate,
} from './ledger-guard';
import {
  guardClientDelegate,
  guardClientTransactionClient,
} from './client-crypto-guard';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    super();
    // Grand livre append-only (CLAUDE.md) : bloque tout update/delete direct
    // sur journalAudit / transactionCaisse, y compris à l'intérieur d'un
    // $transaction (voir l'override de $transaction ci-dessous).
    Object.defineProperty(this, 'journalAudit', {
      value: guardJournalAuditDelegate(this.journalAudit),
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(this, 'transactionCaisse', {
      value: guardTransactionCaisseDelegate(this.transactionCaisse),
      configurable: true,
      enumerable: true,
    });
    // Chiffrement des données client sensibles (CLAUDE.md §6.7) : contact et
    // adresse ne sont jamais écrits/lus en clair via ce delegate.
    Object.defineProperty(this, 'client', {
      value: guardClientDelegate(this.client),
      configurable: true,
      enumerable: true,
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  // Surcharges identiques à celles de PrismaClient.$transaction (forme
  // tableau et forme callback) : seule l'implémentation change, pour que
  // le client `tx` fourni aux transactions interactives passe par les
  // mêmes garde-fous que journalAudit/transactionCaisse au niveau racine.
  $transaction<P extends Prisma.PrismaPromise<unknown>[]>(
    arg: [...P],
    options?: { isolationLevel?: Prisma.TransactionIsolationLevel },
  ): Promise<UnwrapTuple<P>>;
  $transaction<R>(
    fn: (
      prisma: Omit<
        PrismaClient,
        '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'
      >,
    ) => Promise<R>,
    options?: {
      maxWait?: number;
      timeout?: number;
      isolationLevel?: Prisma.TransactionIsolationLevel;
    },
  ): Promise<R>;
  $transaction(arg: unknown, options?: unknown): Promise<unknown> {
    const superTransaction = super.$transaction.bind(this) as (
      arg: unknown,
      options?: unknown,
    ) => Promise<unknown>;
    if (typeof arg === 'function') {
      return superTransaction(
        (tx: object) =>
          (arg as (tx: object) => unknown)(
            guardClientTransactionClient(guardLedgerTransactionClient(tx)),
          ),
        options,
      );
    }
    return superTransaction(arg, options);
  }
}
