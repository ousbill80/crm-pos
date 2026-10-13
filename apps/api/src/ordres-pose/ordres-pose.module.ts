import { Module } from '@nestjs/common';
import { OrdresPoseService } from './ordres-pose.service';
import { OrdresPoseController } from './ordres-pose.controller';
import { OrdrePoseStateMachineService } from './ordre-pose-state-machine.service';

@Module({
  providers: [OrdresPoseService, OrdrePoseStateMachineService],
  controllers: [OrdresPoseController],
  exports: [OrdresPoseService],
})
export class OrdresPoseModule {}
