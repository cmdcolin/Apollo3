import { Module } from '@nestjs/common'

import { ExportController } from './export.controller.js'
import { ExportService } from './export.service.js'

@Module({
  imports: [],
  providers: [ExportService],
  controllers: [ExportController],
})
export class ExportModule {}
