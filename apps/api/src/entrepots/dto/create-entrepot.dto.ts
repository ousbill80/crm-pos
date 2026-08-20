import { IsEnum, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';
import { TypeEntrepot } from '@prisma/client';

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
}
