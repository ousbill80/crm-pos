import {
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

// Catalogue produit du POS (§6.3.2). Paramétrage traité comme de
// l'administration système — même RBAC que zones/boutiques (voir
// apps/api/src/produits/produits.controller.ts).
export class CreateProduitDto {
  @IsString()
  @MinLength(1)
  designation: string;

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
