import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { TypeClient } from '@caisse-crm/shared';

// Fiche client unique consolidée réseau (§6.6) — pas de rattachement
// boutique/zone : un client existe une seule fois pour tout le réseau.
// Peut être personne physique (particulier) ou morale (entreprise).
export class CreateClientDto {
  @IsOptional()
  @IsEnum(TypeClient)
  typeClient?: TypeClient;

  /** Nom de famille (PHYSIQUE) ou raison sociale (MORALE). */
  @IsString()
  @MinLength(1)
  nom: string;

  /**
   * PHYSIQUE : prénom obligatoire.
   * MORALE : interlocuteur optionnel (personne à contacter).
   * La contrainte d’obligation selon le type est appliquée dans ClientsService.
   */
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

  /** Uniquement pour PHYSIQUE — ignorée si MORALE. */
  @ValidateIf(
    (o: CreateClientDto) =>
      (o.typeClient ?? TypeClient.PHYSIQUE) === TypeClient.PHYSIQUE,
  )
  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @IsOptional()
  @IsBoolean()
  consentementMarketing?: boolean;
}
