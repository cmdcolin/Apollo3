import { Module } from '@nestjs/common'

import { ToolsConfigModule } from '../config/tools-config.module.js'
import { PermissionsModule } from '../permissions/permissions.module.js'

import { JBrowseController } from './jbrowse.controller.js'
import { JBrowseService } from './jbrowse.service.js'

@Module({
  controllers: [JBrowseController],
  imports: [PermissionsModule, ToolsConfigModule],
  providers: [JBrowseService],
  exports: [JBrowseService],
})
export class JBrowseModule {}
