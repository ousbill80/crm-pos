import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { UnwrapTuple } from '@prisma/client/runtime/library';
import {
  guardCaisseDelegate,
  guardJournalAuditDelegate,
  guardLedgerTransactionClient,
  guardTransactionCaisseDelegate,
} from './ledger-guard';
import { dechiffrerClientsAuReposSiNecessaire } from './dechiffrer-clients-au-repos';

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
    Object.defineProperty(this, 'caisse', {
      value: guardCaisseDelegate(this.caisse),
      configurable: true,
      enumerable: true,
    });
    // Fiches client : clair au repos (décision §6.7) — pas de Proxy crypto.
  }

  async onModuleInit() {
    await this.$connect();
    // Backfill one-shot si d’anciennes lignes AES-GCM restent en base.
    await dechiffrerClientsAuReposSiNecessaire(this);
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

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
          (arg as (tx: object) => unknown)(guardLedgerTransactionClient(tx)),
        options,
      );
    }
    return superTransaction(arg, options);
  }
}
