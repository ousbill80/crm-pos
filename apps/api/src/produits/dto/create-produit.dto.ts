import { Transform } from 'class-transformer';
import {
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

// Catalogue produit du POS (§6.3.2). Paramétrage traité comme de
// l'administration système — même RBAC que zones/boutiques (voir
// apps/api/src/produits/produits.controller.ts).
export class CreateProduitDto {
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
  @MaxLength(64)
  categorie?: string;

  @IsOptional()
  @Transform(emptyToUndefined)
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsNumber()
  @IsPositive()
  prixUnitaire: number;

  @IsInt()
  @Min(0)
  stock: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  seuilReappro?: number;
}
