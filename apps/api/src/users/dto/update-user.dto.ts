import {
  IsBoolean,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { RoleLibelle } from '@caisse-crm/shared';

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prenom?: string;

  @IsOptional()
  @IsEnum(RoleLibelle)
  role?: RoleLibelle;

  // null explicite = détache la boutique (profils réseau entier).
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsUUID()
  boutiqueId?: string | null;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
