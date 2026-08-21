import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { SegmentClient, TypeClient } from '@caisse-crm/shared';

// Modification de fiche client, y compris la segmentation manuelle
// (§6.6 : "segmentation paramétrable" — ici réglable manuellement par le
// Responsable CRM ; voir aussi POST /crm/clients/:id/segment/recalculer
// pour une proposition automatique basée sur l'historique d'achats).
export class UpdateClientDto {
  @IsOptional()
  @IsEnum(TypeClient)
  typeClient?: TypeClient;

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
  @IsString()
  adresse?: string;

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
