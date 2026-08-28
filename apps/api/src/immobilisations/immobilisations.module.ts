import { Module } from '@nestjs/common';
import { AccountingGlModule } from '../accounting-gl/accounting-gl.module';
import { AuthModule } from '../auth/auth.module';
import { ImmobilisationsController } from './immobilisations.controller';
import { ImmobilisationsService } from './immobilisations.service';

@Module({
  imports: [AuthModule, AccountingGlModule],
  controllers: [ImmobilisationsController],
  providers: [ImmobilisationsService],
  exports: [ImmobilisationsService],
})
export class ImmobilisationsModule {}
