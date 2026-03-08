import { Module } from '@nestjs/common'

import { FilesModule } from '../files/files.module.js'

import { SequenceController } from './sequence.controller.js'
import { SequenceService } from './sequence.service.js'

@Module({
  imports: [FilesModule],
  providers: [SequenceService],
  controllers: [SequenceController],
  exports: [SequenceService],
})
export class SequenceModule {}
