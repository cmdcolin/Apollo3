import { Module } from '@nestjs/common'

import { ExportController } from './export.controller'
import { ExportService } from './export.service'

@Module({
  imports: [],
  providers: [ExportService],
  controllers: [ExportController],
})
export class ExportModule {}
