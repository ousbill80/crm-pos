import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { SHOP_FUNNEL_ACTIONS_CLIENT } from '../shop-aarrr.engine';

export class ShopFunnelEventDto {
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^[A-Za-z0-9_-]+$/)
  sessionId!: string;

  @IsIn([...SHOP_FUNNEL_ACTIONS_CLIENT])
  action!: (typeof SHOP_FUNNEL_ACTIONS_CLIENT)[number];

  @IsOptional()
  @IsString()
  @MaxLength(64)
  produitId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  utmSource?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  utmMedium?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  utmCampaign?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  codeParrain?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  requete?: string;
}
