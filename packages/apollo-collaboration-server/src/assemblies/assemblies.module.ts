import { Module } from '@nestjs/common'
import { FeaturesModule } from 'src/features/features.module'
import { RefSeqsModule } from 'src/refSeqs/refSeqs.module'

import { ChecksModule } from '../checks/checks.module'
import { OperationsModule } from '../operations/operations.module'

import { AssembliesController } from './assemblies.controller'
import { AssembliesService } from './assemblies.service'

@Module({
  controllers: [AssembliesController],
  providers: [AssembliesService],
  imports: [ChecksModule, FeaturesModule, OperationsModule, RefSeqsModule],
  exports: [AssembliesService],
})
export class AssembliesModule {}
