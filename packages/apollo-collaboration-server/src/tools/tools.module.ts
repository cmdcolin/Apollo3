import { Module } from '@nestjs/common'

import { ToolsConfigModule } from '../config/tools-config.module.js'
import { SequenceModule } from '../sequence/sequence.module.js'

import { TiberiusWorkerService } from './tiberius-worker.service.js'
import { ToolsController } from './tools.controller.js'
import { ToolsService } from './tools.service.js'

@Module({
  imports: [ToolsConfigModule, SequenceModule],
  controllers: [ToolsController],
  providers: [ToolsService, TiberiusWorkerService],
})
export class ToolsModule {}
