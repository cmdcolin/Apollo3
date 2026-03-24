import { Module } from '@nestjs/common'

import { SequenceController } from './sequence.controller.js'
import { SequenceService } from './sequence.service.js'

@Module({
  providers: [SequenceService],
  controllers: [SequenceController],
  exports: [SequenceService],
})
export class SequenceModule {}
