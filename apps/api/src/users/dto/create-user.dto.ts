import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import { RoleLibelle } from '@caisse-crm/shared';

export class CreateUserDto {
  @IsString()
  @MinLength(2)
  login: string;

  @IsString()
  @MinLength(1)
  nom: string;

  @IsString()
  @MinLength(1)
  prenom: string;

  @IsEnum(RoleLibelle)
  role: RoleLibelle;

  @IsOptional()
  @IsUUID()
  boutiqueId?: string;

  // Optionnel : si omis, un mot de passe temporaire est généré côté serveur
  // et retourné une seule fois dans la réponse (jamais persisté en clair).
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;
}
