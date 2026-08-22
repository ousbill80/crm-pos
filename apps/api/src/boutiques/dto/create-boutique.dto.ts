import {
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBoutiqueDto {
  @IsString()
  @MinLength(1)
  nom: string;

  @IsString()
  @MinLength(1)
  adresse: string;

  @IsUUID()
  zoneId: string;

  /** Tiroirs POS créés avec le magasin (défaut 1, max 8). §6.7 sans reparamétrage lourd. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  nombreTiroirs?: number;
}

export class CompleterPosteBoutiqueDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(8)
  nombreTiroirs?: number;
}
