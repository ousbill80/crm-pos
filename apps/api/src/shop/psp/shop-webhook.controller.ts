import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { Public } from '../../auth/decorators/public.decorator';
import { ShopPspService } from './shop-psp.service';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ProviderPspShop } from '@caisse-crm/shared';

class PayerCommandeDto {
  @IsOptional()
  @IsEnum(ProviderPspShop)
  provider?: ProviderPspShop;
}

class ConfirmerPaiementDto {
  @IsOptional()
  @IsString()
  reference?: string;
}

@Public()
@Controller('shop')
export class ShopWebhookController {
  constructor(private readonly psp: ShopPspService) {}

  @Post('commandes/:id/payer')
  payer(@Param('id') id: string, @Body() dto: PayerCommandeDto) {
    return this.psp.initierPaiement(id, dto.provider ?? 'PAYSTACK');
  }

  /** Retour Paystack (callback) : vérifie la transaction côté API. */
  @Post('commandes/:id/confirmer-paiement')
  confirmerPaiement(
    @Param('id') id: string,
    @Body() dto: ConfirmerPaiementDto,
  ) {
    return this.psp.confirmerRetourPaystack(id, dto.reference);
  }

  /** Local / staging : simule un webhook de succès (jamais en production). */
  @Post('commandes/:id/sandbox-confirmer')
  confirmerSandbox(@Param('id') id: string) {
    return this.psp.confirmerSandbox(id);
  }

  @Post('webhooks/paystack')
  paystack(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) throw new UnauthorizedException('Corps brut requis.');
    return this.psp.traiterWebhook('PAYSTACK', req.headers, raw);
  }

  @Post('webhooks/orange-money')
  orangeMoney(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) throw new UnauthorizedException('Corps brut requis.');
    return this.psp.traiterWebhook('ORANGE_MONEY', req.headers, raw);
  }

  @Post('webhooks/wave')
  wave(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody;
    if (!raw) throw new UnauthorizedException('Corps brut requis.');
    return this.psp.traiterWebhook('WAVE', req.headers, raw);
  }
}
