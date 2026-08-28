import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { ROLES_PARAMETRES_SHOP } from './commandes-web-roles.constants';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

class ZoneDto {
  @IsString() libelle!: string;
  @IsNumber() tarifForfait!: number;
  @IsNumber() @IsOptional() delaiJoursMin?: number;
  @IsNumber() @IsOptional() delaiJoursMax?: number;
  @IsBoolean() @IsOptional() actif?: boolean;
}

@Controller('zones-livraison')
@Roles(...ROLES_PARAMETRES_SHOP)
export class ZonesLivraisonController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  list() {
    return this.prisma.zoneLivraison.findMany({ orderBy: { libelle: 'asc' } });
  }

  @Post()
  create(@Body() dto: ZoneDto) {
    return this.prisma.zoneLivraison.create({ data: dto });
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body() dto: ZoneDto) {
    return this.prisma.zoneLivraison.update({ where: { id }, data: dto });
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.prisma.zoneLivraison.delete({ where: { id } });
  }
}
