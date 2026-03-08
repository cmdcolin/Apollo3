import { Module } from '@nestjs/common'

import { FilesModule } from '../files/files.module'

import { SequenceController } from './sequence.controller'
import { SequenceService } from './sequence.service'

@Module({
  imports: [FilesModule],
  providers: [SequenceService],
  controllers: [SequenceController],
  exports: [SequenceService],
})
export class SequenceModule {}
