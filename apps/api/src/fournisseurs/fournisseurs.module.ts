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
import { PlanningAchatsController } from './planning-achats.controller';
import { PlanningAchatsService } from './planning-achats.service';
import { RecommandationsAchatsService } from './recommandations-achats.service';
import { SourcingAchatsService } from './sourcing-achats.service';
import { LandedCostCalculator } from './landed-cost.calculator';
import { OrdersImportService } from './orders-import.service';
import { ReceiptStockService } from './receipt-stock.service';
import { ReceiptLandedCostCalculator } from './receipt-landed-cost.calculator';
import { ReceptionAchatStateMachine } from './reception-achat-state-machine';
import { InvoiceMatchCalculator } from './invoice-match.calculator';
import { InvoiceMatchStateMachine } from './invoice-match-state-machine';
import { InvoiceMatchService } from './invoice-match.service';
import { P2pAccountingController } from './p2p-accounting.controller';
import { P2pAccountingService } from './p2p-accounting.service';
import { AccountingGlModule } from '../accounting-gl/accounting-gl.module';
import { AuthModule } from '../auth/auth.module';
import { P2pEvidenceController } from './p2p-evidence.controller';
import { P2pEvidenceService } from './p2p-evidence.service';

@Module({
  imports: [StocksModule, AuthModule, AccountingGlModule],
  providers: [
    FournisseursService,
    AchatsStateMachineService,
    CommandesAchatService,
    FacturesFournisseurService,
    PlanningAchatsService,
    SourcingAchatsService,
    RecommandationsAchatsService,
    LandedCostCalculator,
    OrdersImportService,
    ReceiptStockService,
    ReceiptLandedCostCalculator,
    ReceptionAchatStateMachine,
    InvoiceMatchCalculator,
    InvoiceMatchStateMachine,
    InvoiceMatchService,
    P2pAccountingService,
    P2pEvidenceService,
  ],
  controllers: [
    FournisseursController,
    CommandesAchatController,
    FacturesFournisseurController,
    AchatsReceptionsController,
    PlanningAchatsController,
    P2pAccountingController,
    P2pEvidenceController,
  ],
  exports: [FournisseursService, P2pAccountingService],
})
export class FournisseursModule {}
