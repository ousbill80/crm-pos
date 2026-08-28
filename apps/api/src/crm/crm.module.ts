import { Module } from '@nestjs/common';
import { FideliteModule } from './fidelite/fidelite.module';
import { ClientsService } from './crm.service';
import { ClientsController } from './crm.controller';
import { CrmReseauController } from './crm-reseau.controller';
import { FideliteController } from './fidelite/fidelite.controller';
import { InteractionsService } from './interactions/interactions.service';
import { InteractionsController } from './interactions/interactions.controller';
import { InteractionsReseauController } from './interactions/interactions-reseau.controller';
import { CampagnesService } from './campagnes/campagnes.service';
import { CampagnesController } from './campagnes/campagnes.controller';

// Module CRM (§6.6 du cahier des charges) : fiche client unique consolidée
// réseau, historique d'achats en lecture seule, segmentation, programme de
// fidélité par paliers, interactions CRM, campagnes ciblées. PrismaModule et
// AuditModule sont globaux (@Global()) et n'ont donc pas besoin d'être
// réimportés ici.
@Module({
  imports: [FideliteModule],
  controllers: [
    CrmReseauController,
    ClientsController,
    FideliteController,
    InteractionsReseauController,
    InteractionsController,
    CampagnesController,
  ],
  providers: [ClientsService, InteractionsService, CampagnesService],
  exports: [
    FideliteModule,
    ClientsService,
    InteractionsService,
    CampagnesService,
  ],
})
export class CrmModule {}
