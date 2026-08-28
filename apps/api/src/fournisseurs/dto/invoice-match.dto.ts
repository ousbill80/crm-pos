import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsMimeType,
  IsNotEmpty,
  IsNumberString,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Length,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class InvoiceSourceDocumentDto {
  @IsString()
  @Length(64, 64)
  hashSha256: string;

  @IsString()
  @MaxLength(255)
  nomFichier: string;

  @IsMimeType()
  mimeType: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  tailleOctets?: number;

  @IsString()
  @MaxLength(1000)
  uri: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class P2pInvoiceLineDto {
  @IsUUID()
  ligneCommandeId: string;

  @IsUUID()
  ligneQualiteId: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  @IsNumberString()
  prixUnitaire: string;

  @IsOptional()
  @IsNumberString()
  remise?: string;

  @IsOptional()
  @IsUUID()
  tauxFiscalAchatId?: string;
}

export class AdditionalInvoiceTaxDto {
  @IsUUID()
  tauxFiscalAchatId: string;

  @IsNumberString()
  base: string;
}

export class CreateP2pInvoiceDto {
  @IsUUID()
  clientOperationId: string;

  @IsUUID()
  fournisseurId: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  referenceFournisseur: string;

  @IsDateString()
  dateDocument: string;

  @IsOptional()
  @IsDateString()
  dateEcheance?: string;

  @IsString()
  @Length(3, 3)
  devise: string;

  @IsNumberString()
  tauxChangeSnapshot: string;

  @IsOptional()
  @IsNumberString()
  remiseGlobale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @ValidateNested()
  @Type(() => InvoiceSourceDocumentDto)
  document: InvoiceSourceDocumentDto;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => P2pInvoiceLineDto)
  lignes: P2pInvoiceLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AdditionalInvoiceTaxDto)
  taxesAdditionnelles?: AdditionalInvoiceTaxDto[];
}

export class InvoiceOperationDto {
  @IsUUID()
  clientOperationId: string;
}

export class OptionalInvoiceOperationDto {
  @IsOptional()
  @IsUUID()
  clientOperationId?: string;
}

export class GrantInvoiceExceptionDto extends InvoiceOperationDto {
  @IsString()
  @Length(10, 1000)
  motif: string;
}

export class CreateSupplierCreditNoteDto extends GrantInvoiceExceptionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  referenceFournisseur: string;
}

export class CreateInvoiceExtractionIntakeDto {
  @IsUUID()
  clientOperationId: string;

  @IsUUID()
  fournisseurId: string;

  @ValidateNested()
  @Type(() => InvoiceSourceDocumentDto)
  document: InvoiceSourceDocumentDto;
}

export class ReviewInvoiceExtractionDto extends InvoiceOperationDto {
  @IsIn(['CONFIRMER', 'REJETER'])
  decision: 'CONFIRMER' | 'REJETER';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  commentaire?: string;

  @IsOptional()
  @IsObject()
  payloadRevise?: Record<string, unknown>;
}
