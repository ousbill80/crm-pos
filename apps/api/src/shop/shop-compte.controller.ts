import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Public } from '../auth/decorators/public.decorator';
import { ShopCompteService } from './shop-compte.service';
import { ShopJwtGuard } from './guards/shop-jwt.guard';
import {
  IsEmail,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

class InscriptionDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsString() nom!: string;
  @IsString() prenom!: string;
  /** E.164, ex. +2250700000000 */
  @IsString()
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message:
      'Téléphone invalide (indicatif pays requis, format international).',
  })
  telephone!: string;
}

class LoginDto {
  @IsEmail() email!: string;
  @IsString() password!: string;
}

class RefreshDto {
  @IsString() @MinLength(16) refreshToken!: string;
}

class MotDePasseOublieDto {
  @IsEmail() email!: string;
}

class CreerAdresseDto {
  @IsString() @MinLength(2) libelle!: string;
  @IsString() @MinLength(3) ligne1!: string;
  @IsOptional() @IsString() ligne2?: string;
  @IsString() @MinLength(2) ville!: string;
  @IsOptional() @IsString() telephone?: string;
  @IsOptional() @IsString() region?: string;
  @IsOptional() @IsString() codePostal?: string;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat?: number;
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lng?: number;
}

@Public()
@Controller('shop/compte')
export class ShopCompteController {
  constructor(private readonly service: ShopCompteService) {}

  @Post('inscription')
  inscription(@Body() dto: InscriptionDto) {
    return this.service.inscription(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.service.login(dto);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.service.refresh(dto.refreshToken);
  }

  @Post('mot-de-passe-oublie')
  motDePasseOublie(@Body() dto: MotDePasseOublieDto) {
    return this.service.motDePasseOublie(dto.email);
  }

  @UseGuards(ShopJwtGuard)
  @Get('moi')
  moi(@Req() req: { shopCompteId: string }) {
    return this.service.moi(req.shopCompteId);
  }

  @UseGuards(ShopJwtGuard)
  @Get('commandes')
  commandes(@Req() req: { shopCompteId: string }) {
    return this.service.mesCommandes(req.shopCompteId);
  }

  @UseGuards(ShopJwtGuard)
  @Get('adresses')
  adresses(@Req() req: { shopCompteId: string }) {
    return this.service.mesAdresses(req.shopCompteId);
  }

  @UseGuards(ShopJwtGuard)
  @Post('adresses')
  creerAdresse(
    @Req() req: { shopCompteId: string },
    @Body() dto: CreerAdresseDto,
  ) {
    return this.service.creerAdresse(req.shopCompteId, dto);
  }
}
