import { Module, forwardRef } from '@nestjs/common'

import { MessagesModule } from '../messages/messages.module'
import { RefSeqsModule } from '../refSeqs/refSeqs.module'
import { SequenceModule } from '../sequence/sequence.module'

import { ChecksController } from './checks.controller'
import { ChecksService } from './checks.service'

@Module({
  providers: [ChecksService],
  imports: [forwardRef(() => SequenceModule), MessagesModule, RefSeqsModule],
  exports: [ChecksService],
  controllers: [ChecksController],
})
export class ChecksModule {}
