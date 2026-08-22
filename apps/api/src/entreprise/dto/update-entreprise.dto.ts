import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateEntrepriseDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  raisonSociale?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  adresse?: string;

  @IsOptional()
  @IsString()
  telephone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  devise?: string;

  @IsOptional()
  @IsString()
  logoUrl?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  seuilValidationDg?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  delaiVersementHeures?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seuilFideliteArgent?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seuilFideliteOr?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seuilSegmentRegulier?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  seuilSegmentVip?: number;

  // Avantage fidélité (§6.6) : remise en % appliquée à l'encaissement pour
  // les clients au palier Argent/Or. Désactivé par défaut (0).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  avantageFideliteArgentPct?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  avantageFideliteOrPct?: number;

  // Seuil de caisse (§5.1) : alerte de versement anticipé si le solde
  // courant d'une caisse boutique dépasse ce montant. Désactivé si absent.
  @IsOptional()
  @IsNumber()
  @Min(0)
  seuilVersementAnticipe?: number;

  // SLA de régularisation des litiges (§5.1 : « sous 24 à 48 heures »).
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  delaiRegularisationLitigeHeures?: number;
}
