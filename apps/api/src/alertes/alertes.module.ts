import { Module } from '@nestjs/common';
import { AlertesController } from './alertes.controller';
import { AlertesService } from './alertes.service';

@Module({
  controllers: [AlertesController],
  providers: [AlertesService],
})
export class AlertesModule {}
