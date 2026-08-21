import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { TypeEntrepot, UsageEmplacement } from '@prisma/client';

export class UpdateEntrepotDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsEnum(TypeEntrepot)
  type?: TypeEntrepot;

  @IsOptional()
  @IsEnum(UsageEmplacement)
  usage?: UsageEmplacement;

  @IsOptional()
  @IsBoolean()
  reseau?: boolean;

  @IsOptional()
  @IsBoolean()
  virtuel?: boolean;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
