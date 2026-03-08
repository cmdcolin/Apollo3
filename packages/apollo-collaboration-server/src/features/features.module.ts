import { Module, forwardRef } from '@nestjs/common'

import { ChecksModule } from '../checks/checks.module'
import { OperationsModule } from '../operations/operations.module'

import { FeaturesController } from './features.controller'
import { FeaturesService } from './features.service'

@Module({
  controllers: [FeaturesController],
  providers: [FeaturesService],
  imports: [ChecksModule, forwardRef(() => OperationsModule)],
  exports: [FeaturesService],
})
export class FeaturesModule {}
