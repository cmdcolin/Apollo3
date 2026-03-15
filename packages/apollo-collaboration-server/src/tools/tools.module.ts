import { Module } from '@nestjs/common'

import { ChangesModule } from '../changes/changes.module.js'
import { ToolsConfigModule } from '../config/tools-config.module.js'
import { SequenceModule } from '../sequence/sequence.module.js'

import { ToolsController } from './tools.controller.js'
import { ToolsService } from './tools.service.js'

@Module({
  imports: [ToolsConfigModule, SequenceModule, ChangesModule],
  controllers: [ToolsController],
  providers: [ToolsService],
})
export class ToolsModule {}
