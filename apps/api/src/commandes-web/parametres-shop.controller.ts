import { Body, Controller, Get, Patch } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_PARAMETRES_SHOP } from './commandes-web-roles.constants';
import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsUUID,
} from 'class-validator';
import { ModeAffichagePrixShop } from '@caisse-crm/shared';

class PatchParametresShopDto {
  @IsBoolean() @IsOptional() shopActif?: boolean;
  @IsUUID() @IsOptional() entrepotWebDefautId?: string;
  @IsEnum(ModeAffichagePrixShop)
  @IsOptional()
  modeAffichagePrix?: keyof typeof ModeAffichagePrixShop;
  @IsNumber() @IsOptional() tauxTvaDefaut?: number;
  @IsBoolean() @IsOptional() fallbackPrixMagasin?: boolean;
  @IsBoolean() @IsOptional() paiementRetraitActif?: boolean;
  @IsBoolean() @IsOptional() paiementLivraisonActif?: boolean;
  @IsBoolean() @IsOptional() retraitActif?: boolean;
  @IsBoolean() @IsOptional() livraisonActive?: boolean;
}

@Controller('parametres-shop')
@Roles(...ROLES_PARAMETRES_SHOP)
export class ParametresShopController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async get() {
    return this.prisma.parametreShop.findFirstOrThrow();
  }

  @Patch()
  async patch(@Body() dto: PatchParametresShopDto) {
    const current = await this.prisma.parametreShop.findFirstOrThrow();
    return this.prisma.parametreShop.update({
      where: { id: current.id },
      data: dto,
    });
  }
}
