import { Module } from '@nestjs/common'

import { BlastWorkerService } from './blast-worker.service.js'
import { BlastController } from './blast.controller.js'
import { BlastService } from './blast.service.js'

@Module({
  controllers: [BlastController],
  providers: [BlastService, BlastWorkerService],
})
export class BlastModule {}
