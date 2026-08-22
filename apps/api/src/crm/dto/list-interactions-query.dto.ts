import { Transform, Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { CanalInteraction } from '@caisse-crm/shared';

/** Journal réseau des interactions CRM (§6.6) — filtres de consultation. */
export class ListInteractionsQueryDto {
  @IsOptional()
  @IsUUID()
  clientId?: string;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() || undefined : value,
  )
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  q?: string;

  @IsOptional()
  @IsEnum(CanalInteraction)
  canal?: CanalInteraction;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  type?: string;

  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @IsOptional()
  @IsDateString()
  dateTo?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
