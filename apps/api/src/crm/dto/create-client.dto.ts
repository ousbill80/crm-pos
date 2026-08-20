import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

// Fiche client unique consolidée réseau (§6.6) — pas de rattachement
// boutique/zone : un client existe une seule fois pour tout le réseau.
export class CreateClientDto {
  @IsString()
  @MinLength(1)
  nom: string;

  @IsString()
  @MinLength(1)
  prenom: string;

  @IsOptional()
  @IsString()
  contact?: string;

  @IsOptional()
  @IsDateString()
  dateNaissance?: string;

  @IsOptional()
  @IsBoolean()
  consentementMarketing?: boolean;
}
