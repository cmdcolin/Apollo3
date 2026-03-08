import { Module } from '@nestjs/common'

import { RefSeqsController } from './refSeqs.controller'
import { RefSeqsService } from './refSeqs.service'

@Module({
  imports: [],
  exports: [RefSeqsService],
  controllers: [RefSeqsController],
  providers: [RefSeqsService],
})
export class RefSeqsModule {}
