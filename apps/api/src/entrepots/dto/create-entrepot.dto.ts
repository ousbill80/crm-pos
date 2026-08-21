import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { TypeEntrepot, UsageEmplacement } from '@prisma/client';

export class CreateEntrepotDto {
  @IsString()
  @MinLength(1)
  nom: string;

  @IsString()
  @MinLength(1)
  code: string;

  @IsUUID()
  boutiqueId: string;

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
}
