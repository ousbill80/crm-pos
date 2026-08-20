import { IsBoolean, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { TypeEntrepot } from '@prisma/client';

export class UpdateEntrepotDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsEnum(TypeEntrepot)
  type?: TypeEntrepot;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
