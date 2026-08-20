import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { SegmentClient } from '@caisse-crm/shared';

// Modification de fiche client, y compris la segmentation manuelle
// (§6.6 : "segmentation paramétrable" — ici réglable manuellement par le
// Responsable CRM ; voir aussi POST /crm/clients/:id/segment/recalculer
// pour une proposition automatique basée sur l'historique d'achats).
export class UpdateClientDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  nom?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  prenom?: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @IsOptional()
  @IsBoolean()
  consentementMarketing?: boolean;

  @IsOptional()
  @IsEnum(SegmentClient)
  segment?: SegmentClient;
}
