import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
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
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(400000)
  imageUrl?: string | null;

  @IsOptional()
  @IsIn(['ARTICLE', 'PRESTATION'])
  typeProduit?: 'ARTICLE' | 'PRESTATION';

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

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(64)
  codeBarres?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  uniteMesure?: string;

  @IsOptional()
  @IsIn(['CMP', 'FIFO', 'STANDARD'])
  methodeCout?: 'CMP' | 'FIFO' | 'STANDARD';

  @IsOptional()
  @IsIn(['FIFO', 'FEFO'])
  strategieSortie?: 'FIFO' | 'FEFO';

  @IsOptional()
  @IsNumber()
  @IsPositive()
  prixWeb?: number | null;

  @IsOptional()
  @IsBoolean()
  visibleWeb?: boolean;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(120)
  slug?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  tauxTva?: number | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(160)
  attributs?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(2000000)
  imagesUrls?: string | null;
}
