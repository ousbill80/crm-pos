import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { ModeFulfillmentCommandeWeb } from '@caisse-crm/shared';

export class DisponibiliteStockShopDto {
  @IsEnum(ModeFulfillmentCommandeWeb)
  modeFulfillment!: ModeFulfillmentCommandeWeb;

  @IsOptional()
  @IsUUID()
  boutiqueRetraitId?: string;

  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  produitIds!: string[];
}
