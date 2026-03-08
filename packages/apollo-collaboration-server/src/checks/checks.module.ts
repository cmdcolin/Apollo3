import { Module, forwardRef } from '@nestjs/common'

import { MessagesModule } from '../messages/messages.module.js'
import { RefSeqsModule } from '../refSeqs/refSeqs.module.js'
import { SequenceModule } from '../sequence/sequence.module.js'

import { ChecksController } from './checks.controller.js'
import { ChecksService } from './checks.service.js'

@Module({
  providers: [ChecksService],
  imports: [forwardRef(() => SequenceModule), MessagesModule, RefSeqsModule],
  exports: [ChecksService],
  controllers: [ChecksController],
})
export class ChecksModule {}
