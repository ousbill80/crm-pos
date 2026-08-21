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
  Min,
  MinLength,
  ValidateIf,
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

export class LignePanierAttenteDto {
  @IsUUID()
  produitId: string;

  @IsString()
  designation: string;

  @IsOptional()
  @ValidateIf((_, v) => typeof v === 'string')
  @IsString()
  reference?: string | null;

  @IsString()
  prixUnitaire: string;

  @IsInt()
  @Min(0)
  stock: number;

  @IsInt()
  @IsPositive()
  quantite: number;

  @IsNumber()
  @Min(0)
  remise: number;
}

export class UpsertReservationDto {
  @IsUUID()
  holdId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneReservationDto)
  lignes: LigneReservationDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  numero?: number;

  @IsOptional()
  @IsString()
  libelle?: string;

  @IsOptional()
  @IsIn(['OUBLI_PAIEMENT', 'ARTICLE', 'FIDELITE', 'AUTRE'])
  motif?: string;

  @IsOptional()
  @ValidateIf((_, v) => typeof v === 'string' && v.length > 0)
  @IsUUID()
  clientId?: string | null;

  @IsOptional()
  @IsString()
  remisePanier?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LignePanierAttenteDto)
  panier?: LignePanierAttenteDto[];
}
