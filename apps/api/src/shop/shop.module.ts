import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { FideliteModule } from '../crm/fidelite/fidelite.module';
import { AccountingGlModule } from '../accounting-gl/accounting-gl.module';
import { ShopController } from './shop.controller';
import { ShopBaseService } from './shop-base.service';
import { ShopCatalogueService } from './shop-catalogue.service';
import { ShopPanierService } from './shop-panier.service';
import { ShopCheckoutService } from './shop-checkout.service';
import { PaystackAdapter } from './psp/paystack.adapter';
import { OrangeMoneyAdapter } from './psp/orange-money.adapter';
import { WaveAdapter } from './psp/wave.adapter';
import { ShopPspService } from './psp/shop-psp.service';
import { ShopWebhookController } from './psp/shop-webhook.controller';
import { ShopCompteService } from './shop-compte.service';
import { ShopCompteController } from './shop-compte.controller';
import { ShopEmailService } from './shop-email.service';
import { ShopOrderLifecycleService } from './shop-order-lifecycle.service';
import { ShopAvisService } from './shop-avis.service';
import { ShopAarrrService } from './shop-aarrr.service';
import { ShopStockWebService } from './shop-stock-web.service';
import { ShopJwtGuard } from './guards/shop-jwt.guard';
import { JwtModule } from '@nestjs/jwt';

@Module({
  imports: [
    StocksModule,
    FideliteModule,
    AccountingGlModule,
    JwtModule.register({}),
  ],
  controllers: [ShopController, ShopWebhookController, ShopCompteController],
  providers: [
    ShopBaseService,
    ShopCatalogueService,
    ShopPanierService,
    ShopCheckoutService,
    PaystackAdapter,
    OrangeMoneyAdapter,
    WaveAdapter,
    ShopPspService,
    ShopCompteService,
    ShopEmailService,
    ShopOrderLifecycleService,
    ShopAvisService,
    ShopAarrrService,
    ShopStockWebService,
    ShopJwtGuard,
  ],
  exports: [
    ShopBaseService,
    ShopCatalogueService,
    ShopPanierService,
    ShopCheckoutService,
    ShopPspService,
    ShopEmailService,
    ShopOrderLifecycleService,
    ShopAvisService,
    ShopAarrrService,
    ShopStockWebService,
  ],
})
export class ShopModule {}
