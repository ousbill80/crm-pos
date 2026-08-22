import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
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
}
