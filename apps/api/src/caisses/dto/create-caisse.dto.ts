import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { TypeCaisse } from '@prisma/client';

export class CreateCaisseDto {
  @IsEnum(TypeCaisse)
  type: TypeCaisse;

  @IsUUID()
  boutiqueId: string;

  /** Obligatoire pour TIROIR (ex. T01). */
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  libelle?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordreAffichage?: number;
}

export class CreateTiroirDto {
  @IsUUID()
  boutiqueId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(32)
  code: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  libelle: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordreAffichage?: number;
}

export class UpdateTiroirDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  libelle?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  ordreAffichage?: number;
}
