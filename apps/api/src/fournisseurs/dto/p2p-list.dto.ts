import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import {
  ModePaiementFournisseur,
  StatutPropositionPaiement,
} from '@prisma/client';

export class CostCentreListQueryDto {
  @IsOptional()
  @IsUUID()
  societeId?: string;

  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  actif?: boolean;
}

export class ActiveBudgetListQueryDto extends CostCentreListQueryDto {
  @IsOptional()
  @IsUUID()
  centreCoutId?: string;

  @IsOptional()
  @IsString()
  @Length(3, 3)
  devise?: string;

  @IsOptional()
  @IsDateString()
  activeAt?: string;
}

export class PaymentProposalListQueryDto {
  @IsOptional()
  @IsUUID()
  societeId?: string;

  @IsOptional()
  @IsEnum(StatutPropositionPaiement)
  statut?: StatutPropositionPaiement;

  @IsOptional()
  @IsUUID()
  fournisseurId?: string;

  @IsOptional()
  @IsEnum(ModePaiementFournisseur)
  mode?: ModePaiementFournisseur;

  @IsOptional()
  @IsDateString()
  dateExecutionDu?: string;

  @IsOptional()
  @IsDateString()
  dateExecutionAu?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 50;
}
