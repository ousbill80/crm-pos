import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ChargeInvoiceLineDto {
  @IsUUID()
  natureDepenseId: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  libelle?: string;

  @IsInt()
  @Min(1)
  quantite: number;

  @IsPositive()
  prixUnitaireHt: number;

  @IsOptional()
  @IsUUID()
  tauxFiscalAchatId?: string;
}

export class CreateChargeInvoiceDto {
  @IsUUID()
  societeId: string;

  @IsUUID()
  fournisseurId: string;

  @IsUUID()
  clientOperationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  referenceFournisseur?: string;

  @IsOptional()
  @IsString()
  dateDocument?: string;

  @IsOptional()
  @IsString()
  dateEcheance?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ChargeInvoiceLineDto)
  lignes: ChargeInvoiceLineDto[];
}
