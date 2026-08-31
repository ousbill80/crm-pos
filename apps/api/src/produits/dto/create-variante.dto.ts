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

function emptyToUndefined({ value }: { value: unknown }): unknown {
  if (value === '' || value === null) return undefined;
  return typeof value === 'string' ? value.trim() : value;
}

/** Nouvelle variante e-commerce rattachée à une famille produit. */
export class CreateVarianteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  designation: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(40)
  reference?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(120)
  slug?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  prixUnitaire?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  prixWeb?: number;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(160)
  attributs?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(400000)
  imageUrl?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(2000000)
  imagesUrls?: string;

  @IsOptional()
  @IsBoolean()
  visibleWeb?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
