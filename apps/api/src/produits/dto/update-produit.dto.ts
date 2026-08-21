import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

function emptyToNull({ value }: { value: unknown }): unknown {
  if (value === '' || value === null) return null;
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateProduitDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  designation?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  reference?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(64)
  categorie?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(500)
  description?: string | null;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  prixUnitaire?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  seuilReappro?: number | null;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
