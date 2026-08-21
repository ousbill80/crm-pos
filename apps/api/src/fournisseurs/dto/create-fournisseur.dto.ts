import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

function emptyToNull({ value }: { value: unknown }): unknown {
  if (value === '' || value === null || value === undefined) return undefined;
  return typeof value === 'string' ? value.trim() : value;
}

function emptyToNullOrNull({ value }: { value: unknown }): unknown {
  if (value === '' || value === null) return null;
  return typeof value === 'string' ? value.trim() : value;
}

// Fiche fournisseur (§6.5, extension validée) — pas de facturation / échéances.
export class CreateFournisseurDto {
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nom: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(160)
  contact?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  telephone?: string;

  @IsOptional()
  @Transform(emptyToNullOrNull)
  @ValidateIf((_, v) => v != null)
  @IsEmail()
  @MaxLength(160)
  email?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(240)
  adresse?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
