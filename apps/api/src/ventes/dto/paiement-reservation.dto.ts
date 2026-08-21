import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsPositive,
  IsString,
  IsUUID,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { ModePaiement } from '@caisse-crm/shared';

export class PaiementVenteInputDto {
  @IsIn(Object.values(ModePaiement))
  modePaiement: ModePaiement;

  @IsNumber()
  @IsPositive()
  montant: number;
}

export class DerogationCaisseDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsIn(['REMISE_PLAFOND', 'STOCK_INSUFFISANT'], { each: true })
  motifs: Array<'REMISE_PLAFOND' | 'STOCK_INSUFFISANT'>;

  @IsString()
  @MinLength(1)
  login: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class LigneReservationDto {
  @IsUUID()
  produitId: string;

  @IsInt()
  @IsPositive()
  quantite: number;
}

export class UpsertReservationDto {
  @IsUUID()
  holdId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneReservationDto)
  lignes: LigneReservationDto[];
}
