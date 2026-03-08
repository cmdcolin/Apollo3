import { Module, forwardRef } from '@nestjs/common'

import { AssembliesModule } from '../assemblies/assemblies.module.js'
import { RefSeqsModule } from '../refSeqs/refSeqs.module.js'

import { JBrowseController } from './jbrowse.controller.js'
import { JBrowseService } from './jbrowse.service.js'

@Module({
  controllers: [JBrowseController],
  imports: [forwardRef(() => AssembliesModule), RefSeqsModule],
  providers: [JBrowseService],
  exports: [JBrowseService],
})
export class JBrowseModule {}
