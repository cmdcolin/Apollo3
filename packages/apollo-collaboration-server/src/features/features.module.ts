import { Module } from '@nestjs/common'

import { ChecksModule } from '../checks/checks.module.js'

import { FeaturesController } from './features.controller.js'
import { FeaturesService } from './features.service.js'

@Module({
  controllers: [FeaturesController],
  providers: [FeaturesService],
  imports: [ChecksModule],
  exports: [FeaturesService],
})
export class FeaturesModule {}
