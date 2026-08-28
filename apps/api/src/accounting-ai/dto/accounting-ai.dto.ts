import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ACCOUNTING_AI_SOURCE_TYPES } from '../accounting-ai.types';

export class ComplianceSnapshotDto {
  @IsNumber() debitTotal: number;
  @IsNumber() creditTotal: number;
  @IsBoolean() periodOpen: boolean;
  @IsBoolean() accountMappingValid: boolean;
  @IsBoolean() taxMappingValid: boolean;
  @IsBoolean() sourceTraceable: boolean;
  @IsBoolean() sequenceValid: boolean;
  @IsBoolean() duplicate: boolean;
  @IsBoolean() treasuryReconciled: boolean;
  @IsBoolean() stockReconciled: boolean;
  @IsBoolean() salesReconciled: boolean;
}

export class EnqueueAccountingWorkDto {
  @IsUUID() societeId: string;
  @IsIn(ACCOUNTING_AI_SOURCE_TYPES)
  sourceType: (typeof ACCOUNTING_AI_SOURCE_TYPES)[number];
  @IsString() @MaxLength(160) sourceId: string;
  @IsObject() snapshot: Record<string, unknown>;
  @ValidateNested()
  @Type(() => ComplianceSnapshotDto)
  compliance: ComplianceSnapshotDto;
}

export class CreateAccountingAiPolicyDto {
  @IsUUID() challengeId: string;
  @IsUUID() societeId: string;
  @IsIn(ACCOUNTING_AI_SOURCE_TYPES)
  sourceType: (typeof ACCOUNTING_AI_SOURCE_TYPES)[number];
  @IsIn([
    'DOCUMENT_CLASSIFICATION',
    'JOURNAL_CODING',
    'ACCOUNT_CODING',
    'TAX_CODING',
    'ANALYTIC_CODING',
    'MATCHING',
    'ANOMALY',
  ])
  suggestionKind: string;
  @IsNumber() @Min(0) @Max(1) minimumConfidence: number;
  @IsIn(['LOW']) maximumRisk: 'LOW';
}

export class DecideSuggestionDto {
  @IsIn(['ACCEPTED', 'REJECTED']) decision: 'ACCEPTED' | 'REJECTED';
  @IsOptional() @IsString() @MaxLength(500) reason?: string;
}

export class AssignFindingDto {
  @IsUUID() assignedToId: string;
}

export class ResolveFindingDto {
  @IsString() @MaxLength(1000) resolution: string;
  @IsOptional() @IsUUID() stornoEntryId?: string;
}

export class AccountingAiDashboardQueryDto {
  @IsUUID() societeId: string;
}

export class AccountingAiListQueryDto extends AccountingAiDashboardQueryDto {
  @IsOptional() @IsArray() statuses?: string[];
}
