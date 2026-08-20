import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { CanalInteraction } from '@caisse-crm/shared';

// InteractionCrm.type est une String libre dans le schéma Prisma (ex:
// "RELANCE", "SAV", "PROSPECTION"...) — non contrainte à une énumération
// fermée, contrairement au canal.
export class CreateInteractionDto {
  @IsString()
  @MinLength(1)
  type: string;

  @IsEnum(CanalInteraction)
  canal: CanalInteraction;

  @IsOptional()
  @IsString()
  contenu?: string;

  @IsOptional()
  @IsDateString()
  date?: string;
}
