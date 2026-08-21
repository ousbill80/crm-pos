import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class LigneRepartitionDto {
  @IsUUID()
  produitId: string;

  @IsInt()
  @IsPositive()
  quantite: number;

  @IsOptional()
  @IsUUID()
  entrepotDestId?: string;

  @IsOptional()
  @IsUUID()
  boutiqueId?: string;
}

export class RepartirReceptionDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => LigneRepartitionDto)
  lignes: LigneRepartitionDto[];

  /** Si true, les bons TRANSFERT créés passent en PRET. */
  @IsOptional()
  @IsBoolean()
  pret?: boolean;
}

export class RepartirStockBodyDto extends RepartirReceptionDto {
  @IsUUID()
  receptionId: string;
}
