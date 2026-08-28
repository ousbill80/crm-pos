import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { FacturesClientService } from './factures-client.service';
import {
  CreateFactureClientDto,
  EncaissementFactureClientDto,
  ListFactureClientQueryDto,
  TransitionFactureClientDto,
  UpdateFactureClientDto,
} from './dto/facture-client.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/types';
import {
  ROLES_FACTURE_CLIENT_ECRITURE,
  ROLES_FACTURE_CLIENT_ENCAISSEMENT,
  ROLES_FACTURE_CLIENT_LECTURE,
} from './facture-client-rules.constants';
import { dessinerFactureClientPdf } from '../impressions/facture-client.pdf';
import { pipePdf } from '../impressions/pdf.util';

@Controller('factures-client')
export class FacturesClientController {
  constructor(private readonly factures: FacturesClientService) {}

  @Get()
  @Roles(...ROLES_FACTURE_CLIENT_LECTURE)
  findAll(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListFactureClientQueryDto,
  ) {
    return this.factures.findAll(user, query);
  }

  @Get(':id/pdf')
  @Roles(...ROLES_FACTURE_CLIENT_LECTURE)
  async telechargerPdf(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
    @Res() res: Response,
  ) {
    const data = await this.factures.getFacturePdfData(id, user);
    pipePdf(
      res,
      `facture-${data.numero}.pdf`,
      (doc) => dessinerFactureClientPdf(doc, data),
      'Facture client',
    );
  }

  @Get(':id')
  @Roles(...ROLES_FACTURE_CLIENT_LECTURE)
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.findOne(id, user);
  }

  @Post()
  @Roles(...ROLES_FACTURE_CLIENT_ECRITURE)
  create(
    @Body() dto: CreateFactureClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.create(dto, user);
  }

  @Put(':id')
  @Roles(...ROLES_FACTURE_CLIENT_ECRITURE)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateFactureClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.update(id, dto, user);
  }

  @Patch(':id/statut')
  @Roles(...ROLES_FACTURE_CLIENT_ECRITURE)
  transition(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TransitionFactureClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.transition(id, dto, user);
  }

  @Post(':id/encaissements')
  @Roles(...ROLES_FACTURE_CLIENT_ENCAISSEMENT)
  encaisser(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: EncaissementFactureClientDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.factures.encaisser(id, dto, user);
  }
}
