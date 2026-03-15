import { Module } from '@nestjs/common'

import { ToolsConfigService } from './tools-config.service.js'

@Module({
  providers: [ToolsConfigService],
  exports: [ToolsConfigService],
})
export class ToolsConfigModule {}
