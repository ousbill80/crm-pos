import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdateBoutiqueDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  adresse?: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;

  /** Visible dans le checkout click & collect du site e-commerce. */
  @IsOptional()
  @IsBoolean()
  retraitWebActif?: boolean;

  /** Entrepôt débité pour le retrait web (souvent le PRINCIPAL du magasin). */
  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsUUID()
  entrepotWebId?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== undefined)
  @IsInt()
  @Min(0)
  delaiRetraitHeures?: number | null;
}
