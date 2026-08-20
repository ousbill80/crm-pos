import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EntrepriseController } from './entreprise.controller';
import { EntrepriseService } from './entreprise.service';

@Module({
  imports: [AuditModule],
  controllers: [EntrepriseController],
  providers: [EntrepriseService],
  exports: [EntrepriseService],
})
export class EntrepriseModule {}
