import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import { CommandesWebService } from './commandes-web.service';
import { ShopPspService } from '../shop/psp/shop-psp.service';
import { ShopAarrrService } from '../shop/shop-aarrr.service';
import {
  ROLES_COMMANDES_WEB_ECRITURE,
  ROLES_COMMANDES_WEB_LECTURE,
  ROLES_CONVERSION_VENTE,
  ROLES_SHOP_AARRR_LECTURE,
} from './commandes-web-roles.constants';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';
import {
  ModeFulfillmentCommandeWeb,
  StatutCommandeWeb,
} from '@caisse-crm/shared';

class ChangerStatutDto {
  @IsEnum(StatutCommandeWeb)
  statut!: keyof typeof StatutCommandeWeb;

  @IsOptional()
  @IsString()
  numeroSuivi?: string;
}

class ConvertirVenteDto {
  @IsUUID()
  clientOperationId!: string;
}

class ScanQrDto {
  @IsString()
  @MinLength(8)
  suiviToken!: string;

  @IsUUID()
  clientOperationId!: string;
}

@Controller('commandes-web')
export class CommandesWebController {
  constructor(
    private readonly service: CommandesWebService,
    private readonly psp: ShopPspService,
    private readonly aarrr: ShopAarrrService,
  ) {}

  @Get()
  @Roles(...ROLES_COMMANDES_WEB_LECTURE)
  lister(
    @CurrentUser() user: AuthenticatedUser,
    @Query('statut') statut?: keyof typeof StatutCommandeWeb,
    @Query('boutiqueRetraitId') boutiqueRetraitId?: string,
    @Query('modeFulfillment')
    modeFulfillment?: keyof typeof ModeFulfillmentCommandeWeb,
    @Query('q') q?: string,
  ) {
    return this.service.lister(
      { statut, boutiqueRetraitId, modeFulfillment, q },
      user,
    );
  }

  @Get('aarrr')
  @Roles(...ROLES_SHOP_AARRR_LECTURE)
  tableauAarrr(@Query('jours') jours?: string) {
    return this.aarrr.tableauDeBord(jours ? Number(jours) : 7);
  }

  @Get('par-token/:token')
  @Roles(...ROLES_CONVERSION_VENTE)
  detailParToken(
    @Param('token') token: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.detailParSuiviToken(token, user);
  }

  @Get(':id')
  @Roles(...ROLES_COMMANDES_WEB_LECTURE)
  detail(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.service.detail(id, user);
  }

  @Patch(':id/statut')
  @Roles(...ROLES_COMMANDES_WEB_ECRITURE)
  statut(
    @Param('id') id: string,
    @Body() dto: ChangerStatutDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.changerStatut(id, dto.statut, user, dto.numeroSuivi);
  }

  @Post('scan-qr')
  @Roles(...ROLES_CONVERSION_VENTE)
  scanQr(@Body() dto: ScanQrDto, @CurrentUser() user: AuthenticatedUser) {
    return this.service.convertirParSuiviToken(
      dto.suiviToken,
      user,
      dto.clientOperationId,
    );
  }

  @Post(':id/convertir-vente')
  @Roles(...ROLES_CONVERSION_VENTE)
  convertir(
    @Param('id') id: string,
    @Body() dto: ConvertirVenteDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.service.convertirVente(id, user, dto.clientOperationId);
  }

  @Post(':id/rembourser')
  @Roles(...ROLES_COMMANDES_WEB_ECRITURE)
  rembourser(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.psp.rembourser(id, user.userId);
  }
}
