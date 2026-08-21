import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TypeOperationStock } from '@caisse-crm/shared';

export class LigneBonStockDto {
  @IsUUID()
  produitId: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantiteOk?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  quantiteRebut?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  numeroLot?: string;

  @IsOptional()
  @IsString()
  dateExpiration?: string;
}

export class CreateBonStockDto {
  @IsIn(Object.values(TypeOperationStock))
  type: TypeOperationStock;

  @IsOptional()
  @IsUUID()
  entrepotSourceId?: string;

  @IsOptional()
  @IsUUID()
  entrepotDestId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneBonStockDto)
  lignes: LigneBonStockDto[];
}

export class CreateRegleReapproDto {
  @IsUUID()
  produitId: string;

  @IsUUID()
  entrepotId: string;

  @IsInt()
  @Min(0)
  min: number;

  @IsInt()
  @Min(0)
  max: number;
}

export class CreateCoutLogistiqueDto {
  @IsUUID()
  produitId: string;

  @IsOptional()
  @IsUUID()
  receptionId?: string;

  @IsString()
  @MaxLength(160)
  libelle: string;

  @IsNumber()
  @IsPositive()
  montant: number;
}

export class CreateLotDto {
  @IsUUID()
  produitId: string;

  @IsString()
  @MaxLength(80)
  numero: string;

  @IsOptional()
  @IsString()
  dateExpiration?: string;
}
