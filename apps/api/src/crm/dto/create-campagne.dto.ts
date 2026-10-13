import { Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import {
  CanalInteraction,
  NiveauFidelite,
  SegmentClient,
} from '@caisse-crm/shared';

// Campagne ciblée (§6.6) : ciblage par segment/niveau de fidélité + message
// à diffuser manuellement (canal indicatif). Pas d'envoi automatisé — voir
// campagnes.service.ts.
export class CreateCampagneDto {
  @IsString()
  @MinLength(1)
  nom: string;

  @IsString()
  @MinLength(1)
  message: string;

  @IsOptional()
  @IsEnum(SegmentClient)
  segment?: SegmentClient;

  @IsOptional()
  @IsEnum(NiveauFidelite)
  niveauFidelite?: NiveauFidelite;

  @IsEnum(CanalInteraction)
  canal: CanalInteraction;

  // Inactivité (§6.6 ciblage relance) : clients sans achat depuis N mois,
  // cumulable (ET) avec segment/niveauFidelite.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  inactifDepuisMois?: number;
}
