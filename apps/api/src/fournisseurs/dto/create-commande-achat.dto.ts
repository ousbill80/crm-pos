import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsIn,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class LigneCommandeAchatDto {
  @IsUUID()
  produitId: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  @IsNumber()
  @IsPositive()
  prixUnitaire: number;
}

export class CreateCommandeAchatDto {
  @IsOptional()
  @IsUUID()
  clientOperationId?: string;

  @IsOptional()
  @IsUUID()
  societeId?: string;

  @IsUUID()
  fournisseurId: string;

  @IsOptional()
  @IsUUID()
  boutiqueId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  devise?: string;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  tauxChangeSnapshot?: number;

  @IsOptional()
  @IsString()
  @IsIn(['EXW', 'FCA', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP'])
  incoterm?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lieuOrigine?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  lieuDestination?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  proformaReference?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  conditionsPaiement?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EcheancePaiementCommandeDto)
  echeancesPaiement?: EcheancePaiementCommandeDto[];

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneCommandeAchatDto)
  lignes: LigneCommandeAchatDto[];
}

export class EcheancePaiementCommandeDto {
  @IsIn(['ACOMPTE', 'SOLDE', 'LETTRE_CREDIT', 'AUTRE'])
  type: 'ACOMPTE' | 'SOLDE' | 'LETTRE_CREDIT' | 'AUTRE';

  @IsInt()
  @IsPositive()
  ordre: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  pourcentage?: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  montant?: number;

  @IsOptional()
  @IsString()
  datePrevue?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  conditions?: string;
}
