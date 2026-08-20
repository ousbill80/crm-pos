import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { EntrepotsController } from './entrepots.controller';
import { EntrepotsService } from './entrepots.service';

@Module({
  imports: [AuditModule],
  controllers: [EntrepotsController],
  providers: [EntrepotsService],
  exports: [EntrepotsService],
})
export class EntrepotsModule {}
