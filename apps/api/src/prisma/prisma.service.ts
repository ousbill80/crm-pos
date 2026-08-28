import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import type { UnwrapTuple } from '@prisma/client/runtime/library';
import {
  guardCaisseDelegate,
  guardAppendOnlyDelegate,
  guardCommandeAchatVersionDelegate,
  guardJournalAuditDelegate,
  guardLedgerTransactionClient,
  guardLettrageDelegate,
  guardMouvementStockDelegate,
  guardMouvementBudgetAchatDelegate,
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
    Object.defineProperty(this, 'mouvementBudgetAchat', {
      value: guardMouvementBudgetAchatDelegate(this.mouvementBudgetAchat),
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(this, 'commandeAchatVersion', {
      value: guardCommandeAchatVersionDelegate(this.commandeAchatVersion),
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(this, 'mouvementStock', {
      value: guardMouvementStockDelegate(this.mouvementStock),
      configurable: true,
      enumerable: true,
    });
    for (const model of [
      'ecritureComptable',
      'mouvementTresorerie',
      'paiementFournisseur',
      'importReleveBancaire',
      'ligneReleveBancaire',
      'rapprochementBancaire',
      'accountingAiDecisionEvent',
      'accountingAiEvidence',
    ] as const) {
      Object.defineProperty(this, model, {
        value: guardAppendOnlyDelegate(
          this[model],
          'Fait comptable append-only',
        ),
        configurable: true,
        enumerable: true,
      });
    }
    Object.defineProperty(this, 'ligneEcritureComptable', {
      value: guardLettrageDelegate(
        this.ligneEcritureComptable,
        'Ligne d’écriture',
        new Set(['lettrage', 'dateLettrage']),
      ),
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(this, 'allocationPaiementFournisseur', {
      value: guardLettrageDelegate(
        this.allocationPaiementFournisseur,
        'Allocation de paiement',
        new Set(['paiementId', 'lettrage']),
      ),
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(this, 'shopFunnelEvent', {
      value: guardAppendOnlyDelegate(
        this.shopFunnelEvent,
        'Funnel shop append-only',
      ),
      configurable: true,
      enumerable: true,
    });
    Object.defineProperty(this, 'staffBriefingEnvoi', {
      value: guardAppendOnlyDelegate(
        this.staffBriefingEnvoi,
        'Briefing staff append-only',
      ),
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
