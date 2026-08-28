import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccountingAiComplianceEngine } from './accounting-ai.compliance';
import { AccountingAiController } from './accounting-ai.controller';
import {
  AccountingAiDisabledProvider,
  AccountingAiExternalHttpProvider,
} from './accounting-ai.provider';
import { AccountingAiPolicyEvaluator } from './accounting-ai.policy';
import { AccountingAiService } from './accounting-ai.service';
import { ACCOUNTING_AI_PROVIDER } from './accounting-ai.tokens';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [AccountingAiController],
  providers: [
    AccountingAiComplianceEngine,
    AccountingAiPolicyEvaluator,
    AccountingAiService,
    {
      provide: ACCOUNTING_AI_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        if (config.get('ACCOUNTING_AI_MODE') !== 'EXTERNAL_HTTP') {
          return new AccountingAiDisabledProvider();
        }
        const endpoint = config.get<string>('ACCOUNTING_AI_ENDPOINT');
        const apiKey = config.get<string>('ACCOUNTING_AI_API_KEY');
        if (!endpoint || !apiKey) {
          throw new Error(
            'ACCOUNTING_AI_ENDPOINT and ACCOUNTING_AI_API_KEY are required in EXTERNAL_HTTP mode',
          );
        }
        const url = new URL(endpoint);
        if (url.protocol !== 'https:') {
          throw new Error('ACCOUNTING_AI_ENDPOINT must use HTTPS');
        }
        const configuredTimeout = Number(
          config.get('ACCOUNTING_AI_TIMEOUT_MS') ?? 3000,
        );
        const timeoutMs = Number.isFinite(configuredTimeout)
          ? Math.min(10_000, Math.max(100, configuredTimeout))
          : 3000;
        return new AccountingAiExternalHttpProvider({
          endpoint,
          apiKey,
          timeoutMs,
        });
      },
    },
  ],
  exports: [AccountingAiService, AccountingAiComplianceEngine],
})
export class AccountingAiModule {}
