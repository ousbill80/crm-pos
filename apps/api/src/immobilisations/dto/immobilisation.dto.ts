import { Type } from 'class-transformer';
import {
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateImmobilisationDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  compteId: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  libelle: string;

  @IsDateString()
  dateMiseEnService: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valeurBrute: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(600)
  dureeMois: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  valeurResiduelle?: number;
}

export class ImmobilisationListQueryDto {
  @IsUUID()
  societeId: string;
}

export class SortirImmobilisationDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  motif?: string;
}

export class GenererDotationsDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  periodeId: string;
}
