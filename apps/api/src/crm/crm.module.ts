import { Module } from '@nestjs/common';
import { ClientsService } from './crm.service';
import { ClientsController } from './crm.controller';
import { FideliteService } from './fidelite/fidelite.service';
import { FideliteController } from './fidelite/fidelite.controller';
import { InteractionsService } from './interactions/interactions.service';
import { InteractionsController } from './interactions/interactions.controller';

// Module CRM (§6.6 du cahier des charges) : fiche client unique consolidée
// réseau, historique d'achats en lecture seule, segmentation, programme de
// fidélité par paliers, interactions CRM. PrismaModule et AuditModule sont
// globaux (@Global()) et n'ont donc pas besoin d'être réimportés ici.
@Module({
  controllers: [ClientsController, FideliteController, InteractionsController],
  providers: [ClientsService, FideliteService, InteractionsService],
  exports: [ClientsService, FideliteService, InteractionsService],
})
export class CrmModule {}
