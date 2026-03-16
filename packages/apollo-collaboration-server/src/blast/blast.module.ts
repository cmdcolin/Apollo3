import { Module } from '@nestjs/common'

import { BlastController } from './blast.controller.js'
import { BlastService } from './blast.service.js'

@Module({
  controllers: [BlastController],
  providers: [BlastService],
})
export class BlastModule {}
