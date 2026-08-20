import { Module } from '@nestjs/common';
import { BoutiquesService } from './boutiques.service';
import { BoutiquesController } from './boutiques.controller';

@Module({
  providers: [BoutiquesService],
  controllers: [BoutiquesController],
  exports: [BoutiquesService],
})
export class BoutiquesModule {}
