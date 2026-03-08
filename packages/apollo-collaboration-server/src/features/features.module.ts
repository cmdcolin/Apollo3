import { Module, forwardRef } from '@nestjs/common'

import { ChecksModule } from '../checks/checks.module.js'
import { OperationsModule } from '../operations/operations.module.js'

import { FeaturesController } from './features.controller.js'
import { FeaturesService } from './features.service.js'

@Module({
  controllers: [FeaturesController],
  providers: [FeaturesService],
  imports: [ChecksModule, forwardRef(() => OperationsModule)],
  exports: [FeaturesService],
})
export class FeaturesModule {}
