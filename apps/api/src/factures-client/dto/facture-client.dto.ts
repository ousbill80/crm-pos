import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  ModeEncaissementFactureClient,
  StatutFactureClient,
} from '@prisma/client';

export class LigneFactureClientDto {
  @IsOptional()
  @IsUUID()
  produitId?: string;

  @IsString()
  @MinLength(1)
  designation!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantite!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  prixUnitaire!: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  remise?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  tauxTva?: number;
}

export class CreateFactureClientDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  boutiqueId?: string;

  @IsOptional()
  @IsUUID()
  devisId?: string;

  @IsOptional()
  @IsDateString()
  dateFacture?: string;

  @IsOptional()
  @IsDateString()
  dateEcheance?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneFactureClientDto)
  lignes!: LigneFactureClientDto[];
}

export class UpdateFactureClientDto {
  @IsOptional()
  @IsDateString()
  dateEcheance?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneFactureClientDto)
  lignes?: LigneFactureClientDto[];
}

export class TransitionFactureClientDto {
  @IsString()
  statut!: string;
}

export class EncaissementFactureClientDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  montant!: number;

  @IsEnum(ModeEncaissementFactureClient)
  mode!: ModeEncaissementFactureClient;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}

export class ListFactureClientQueryDto {
  @IsOptional()
  @IsEnum(StatutFactureClient)
  statut?: StatutFactureClient;

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
}
