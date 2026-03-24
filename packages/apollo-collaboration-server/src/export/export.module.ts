import { Module } from '@nestjs/common'

import { SequenceModule } from '../sequence/sequence.module.js'

import { ExportController } from './export.controller.js'
import { ExportService } from './export.service.js'

@Module({
  imports: [SequenceModule],
  providers: [ExportService],
  controllers: [ExportController],
})
export class ExportModule {}
