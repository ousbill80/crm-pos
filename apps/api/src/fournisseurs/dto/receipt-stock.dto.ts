import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsMimeType,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class ReceptionEvidenceDto {
  @IsIn(['DOCUMENT', 'PHOTO'])
  type: 'DOCUMENT' | 'PHOTO';

  @IsString()
  @MaxLength(255)
  nomFichier: string;

  @IsMimeType()
  mimeType: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  tailleOctets?: number;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  empreinteSha256?: string;

  @IsString()
  @MaxLength(2048)
  uri: string;
}

export class ReceptionAchatLineDto {
  @IsUUID()
  ligneCommandeId: string;

  @IsInt()
  @IsPositive()
  quantiteRecue: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  codeBarres?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  numeroLot?: string;

  @IsOptional()
  @IsDateString()
  dateExpiration?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  numerosSerie?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motifEcart?: string;
}

export class CreateReceptionAchatDto {
  @IsUUID()
  clientOperationId: string;

  @IsUUID()
  commandeId: string;

  @IsOptional()
  @IsUUID()
  expeditionId?: string;

  @IsUUID()
  emplacementQuarantaineId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceLivraison?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceptionAchatLineDto)
  lignes: ReceptionAchatLineDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReceptionEvidenceDto)
  preuves?: ReceptionEvidenceDto[];
}

export class QualityDecisionLineDto {
  @IsUUID()
  ligneReceptionId: string;

  @IsInt()
  @Min(0)
  quantiteAcceptee: number;

  @IsInt()
  @Min(0)
  quantiteRejetee: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  motifRejet?: string;
}

export class QualityDecisionDto {
  @IsUUID()
  clientOperationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  commentaire?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QualityDecisionLineDto)
  lignes: QualityDecisionLineDto[];
}

export class ManualAllocationDto {
  @IsUUID()
  ligneQualiteId: string;

  @IsNumber()
  @Min(0)
  montant: number;
}

export class AllocateReceiptCostDto {
  @IsUUID()
  clientOperationId: string;

  @IsString()
  @MaxLength(200)
  libelle: string;

  @IsNumber()
  @Min(0)
  montant: number;

  @IsIn(['VALEUR', 'QUANTITE', 'MANUELLE'])
  methode: 'VALEUR' | 'QUANTITE' | 'MANUELLE';

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ManualAllocationDto)
  allocations?: ManualAllocationDto[];
}

export class PutawayLineDto {
  @IsUUID()
  ligneQualiteId: string;

  @IsUUID()
  destinationId: string;
}

export class PutawayReceiptDto {
  @IsUUID()
  clientOperationId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PutawayLineDto)
  lignes: PutawayLineDto[];
}

export class SupplierReturnLineDto {
  @IsUUID()
  ligneQualiteId: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  @IsBoolean()
  depuisStock: boolean;

  @IsUUID()
  sourceId: string;
}

export class CreateSupplierReturnDto {
  @IsUUID()
  clientOperationId: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  referenceRma?: string;

  @IsString()
  @MaxLength(500)
  motif: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reclamationQualite?: string;

  @IsBoolean()
  avoirAttendu: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  montantAvoirAttendu?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SupplierReturnLineDto)
  lignes: SupplierReturnLineDto[];
}

export class DispatchSupplierReturnDto {
  @IsUUID()
  clientOperationId: string;
}

export class ShortCloseLineDto {
  @IsUUID()
  ligneCommandeId: string;

  @IsInt()
  @IsPositive()
  quantiteAnnulee: number;

  @IsString()
  @MaxLength(500)
  motif: string;
}

export class ShortCloseDto {
  @IsUUID()
  clientOperationId: string;

  @IsString()
  @MaxLength(500)
  motif: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ShortCloseLineDto)
  lignes: ShortCloseLineDto[];
}
