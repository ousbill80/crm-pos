import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
} from 'class-validator';
import { ModePaiementFournisseur } from '@caisse-crm/shared';

export class CreatePaiementFournisseurDto {
  @IsNumber()
  @IsPositive()
  montant: number;

  @IsEnum(ModePaiementFournisseur)
  mode: ModePaiementFournisseur;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  reference?: string;
}
