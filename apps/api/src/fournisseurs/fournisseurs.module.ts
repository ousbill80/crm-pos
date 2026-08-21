import { Module } from '@nestjs/common';
import { StocksModule } from '../stocks/stocks.module';
import { FournisseursService } from './fournisseurs.service';
import { FournisseursController } from './fournisseurs.controller';
import { AchatsStateMachineService } from './achats-state-machine.service';
import { CommandesAchatService } from './commandes-achat.service';
import { CommandesAchatController } from './commandes-achat.controller';
import { FacturesFournisseurService } from './factures-fournisseur.service';
import { FacturesFournisseurController } from './factures-fournisseur.controller';
import { AchatsReceptionsController } from './achats-receptions.controller';

@Module({
  imports: [StocksModule],
  providers: [
    FournisseursService,
    AchatsStateMachineService,
    CommandesAchatService,
    FacturesFournisseurService,
  ],
  controllers: [
    FournisseursController,
    CommandesAchatController,
    FacturesFournisseurController,
    AchatsReceptionsController,
  ],
  exports: [FournisseursService],
})
export class FournisseursModule {}
