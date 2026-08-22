import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
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
import { StatutDevisClient } from '@prisma/client';

export class LigneDevisDto {
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
}

export class CreateDevisDto {
  @IsUUID()
  clientId!: string;

  @IsOptional()
  @IsUUID()
  boutiqueId?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneDevisDto)
  lignes!: LigneDevisDto[];
}

export class UpdateDevisDto {
  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneDevisDto)
  lignes?: LigneDevisDto[];
}

export class TransitionDevisDto {
  @IsString()
  statut!: string;

  @IsOptional()
  @IsUUID()
  venteId?: string;
}

export class ListDevisQueryDto {
  @IsOptional()
  @IsEnum(StatutDevisClient)
  statut?: StatutDevisClient;

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
