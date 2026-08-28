import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class LigneDemandeAchatDto {
  @IsOptional()
  @IsUUID()
  produitId?: string;

  @IsString()
  @MaxLength(200)
  designation: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  @IsOptional()
  @IsNumber()
  @IsPositive()
  prixEstime?: number;

  @IsOptional()
  @IsDateString()
  dateBesoin?: string;
}

export class CreateDemandeAchatDto {
  @IsUUID()
  clientOperationId: string;

  @IsString()
  @MaxLength(200)
  objet: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  justification?: string;

  @IsUUID()
  centreCoutId: string;

  @IsUUID()
  budgetId: string;

  @IsOptional()
  @IsUUID()
  boutiqueId?: string;

  @IsString()
  @MaxLength(10)
  devise: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneDemandeAchatDto)
  lignes: LigneDemandeAchatDto[];
}

export class UpdateDemandeAchatDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  objet?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  justification?: string;

  @IsOptional()
  @IsUUID()
  centreCoutId?: string;

  @IsOptional()
  @IsUUID()
  budgetId?: string;

  @IsOptional()
  @IsUUID()
  boutiqueId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  devise?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneDemandeAchatDto)
  lignes?: LigneDemandeAchatDto[];
}

export class DecisionDemandeAchatDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  motif?: string;
}

export class CreateConsultationDto {
  @IsUUID()
  clientOperationId: string;

  @IsArray()
  @ArrayMinSize(1)
  @IsUUID(undefined, { each: true })
  fournisseurIds: string[];

  @IsOptional()
  @IsDateString()
  dateLimite?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

export class LigneOffreFournisseurDto {
  @IsUUID()
  ligneDemandeId: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  @IsNumber()
  @IsPositive()
  prixUnitaire: number;
}

export class CreateOffreFournisseurDto {
  @IsUUID()
  clientOperationId: string;

  @IsUUID()
  fournisseurId: string;

  @IsString()
  @MaxLength(10)
  devise: string;

  @IsNumber()
  @Min(0)
  transport: number;

  @IsNumber()
  @Min(0)
  assurance: number;

  @IsNumber()
  @Min(0)
  douane: number;

  @IsNumber()
  @Min(0)
  taxes: number;

  @IsNumber()
  @Min(0)
  autresCouts: number;

  @IsInt()
  @Min(0)
  delaiLivraisonJours: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  conditionsPaiement?: string;

  @IsOptional()
  @IsDateString()
  validiteJusquAu?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneOffreFournisseurDto)
  lignes: LigneOffreFournisseurDto[];
}

export class RecommandationsAchatQueryDto {
  @IsUUID()
  entrepotId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  fenetreJours: number;
}
