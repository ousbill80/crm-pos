import { Module } from '@nestjs/common';
import { CrmService } from './crm.service';
import { CrmController } from './crm.controller';

@Module({
  providers: [CrmService],
  controllers: [CrmController],
})
export class CrmModule {}
