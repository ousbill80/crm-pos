import { Module } from '@nestjs/common';
import { FideliteService } from './fidelite.service';

/** Module fidélité sans controllers — importable par api-shop (isolation Lot 3). */
@Module({
  providers: [FideliteService],
  exports: [FideliteService],
})
export class FideliteModule {}
