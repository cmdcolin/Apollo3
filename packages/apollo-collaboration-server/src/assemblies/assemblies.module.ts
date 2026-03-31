import { Module } from '@nestjs/common'

import { ChecksModule } from '../checks/checks.module.js'
import { FeaturesModule } from '../features/features.module.js'

import { AssembliesController } from './assemblies.controller.js'
import { AssembliesService } from './assemblies.service.js'

@Module({
  controllers: [AssembliesController],
  providers: [AssembliesService],
  imports: [ChecksModule, FeaturesModule],
  exports: [AssembliesService],
})
export class AssembliesModule {}
