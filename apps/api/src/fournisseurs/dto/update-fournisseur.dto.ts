import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

function emptyToNull({ value }: { value: unknown }): unknown {
  if (value === '' || value === null) return null;
  return typeof value === 'string' ? value.trim() : value;
}

export class UpdateFournisseurDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  nom?: string;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(160)
  contact?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(40)
  telephone?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @ValidateIf((_, v) => v != null)
  @IsEmail()
  @MaxLength(160)
  email?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(240)
  adresse?: string | null;

  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @MaxLength(1000)
  notes?: string | null;

  @IsOptional()
  @IsBoolean()
  actif?: boolean;
}
