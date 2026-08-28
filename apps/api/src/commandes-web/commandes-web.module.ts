import { Module } from '@nestjs/common';
import { CommandesWebController } from './commandes-web.controller';
import { CommandesWebService } from './commandes-web.service';
import { ParametresShopController } from './parametres-shop.controller';
import { ZonesLivraisonController } from './zones-livraison.controller';
import { ShopModule } from '../shop/shop.module';
import { AccountingGlModule } from '../accounting-gl/accounting-gl.module';

@Module({
  imports: [ShopModule, AccountingGlModule],
  controllers: [
    CommandesWebController,
    ParametresShopController,
    ZonesLivraisonController,
  ],
  providers: [CommandesWebService],
})
export class CommandesWebModule {}
