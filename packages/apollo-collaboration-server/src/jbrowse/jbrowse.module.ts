import { Module } from '@nestjs/common'

import { AnalysisModule } from '../analysis/analysis.module.js'
import { PermissionsModule } from '../permissions/permissions.module.js'

import { JBrowseController } from './jbrowse.controller.js'
import { JBrowseService } from './jbrowse.service.js'

@Module({
  controllers: [JBrowseController],
  imports: [PermissionsModule, AnalysisModule],
  providers: [JBrowseService],
  exports: [JBrowseService],
})
export class JBrowseModule {}
