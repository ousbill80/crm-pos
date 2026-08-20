import { IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';

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
}
