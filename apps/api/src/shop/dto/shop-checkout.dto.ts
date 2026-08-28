import {
  IsEmail,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateIf,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ModeFulfillmentCommandeWeb,
  ModeReglementCommandeWeb,
  ProviderPspShop,
} from '@caisse-crm/shared';

export class CheckoutShopDto {
  @IsEnum(ModeFulfillmentCommandeWeb)
  modeFulfillment!: ModeFulfillmentCommandeWeb;

  @IsEnum(ModeReglementCommandeWeb)
  modeReglement!: ModeReglementCommandeWeb;

  @ValidateIf((o: CheckoutShopDto) => o.modeReglement === 'PREPAYE_PSP')
  @IsEnum(ProviderPspShop)
  @IsOptional()
  providerPsp?: ProviderPspShop;

  @ValidateIf((o: CheckoutShopDto) => o.modeFulfillment === 'RETRAIT_BOUTIQUE')
  @IsUUID()
  boutiqueRetraitId?: string;

  @ValidateIf((o: CheckoutShopDto) => o.modeFulfillment === 'LIVRAISON')
  @IsUUID()
  zoneLivraisonId?: string;

  @ValidateIf((o: CheckoutShopDto) => o.modeFulfillment === 'LIVRAISON')
  @IsObject()
  adresseLivraison?: Record<string, unknown>;

  @IsEmail()
  @IsOptional()
  emailInvite?: string;

  @IsString()
  @IsOptional()
  telephoneInvite?: string;

  @IsString()
  @IsOptional()
  noteClient?: string;

  @IsUUID()
  clientOperationId!: string;
}

export class PanierLigneDto {
  @IsUUID()
  produitId!: string;

  @IsInt()
  @Min(1)
  quantite!: number;
}

export class UpdatePanierLignesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PanierLigneDto)
  lignes!: PanierLigneDto[];
}
