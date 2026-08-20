import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

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
}
