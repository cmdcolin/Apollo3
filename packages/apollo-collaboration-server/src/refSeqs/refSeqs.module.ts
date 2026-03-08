import { Module } from '@nestjs/common'

import { RefSeqsController } from './refSeqs.controller.js'
import { RefSeqsService } from './refSeqs.service.js'

@Module({
  imports: [],
  exports: [RefSeqsService],
  controllers: [RefSeqsController],
  providers: [RefSeqsService],
})
export class RefSeqsModule {}
