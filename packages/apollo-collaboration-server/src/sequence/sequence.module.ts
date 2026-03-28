import { Module } from '@nestjs/common'

import { PermissionsModule } from '../permissions/permissions.module.js'

import { SequenceController } from './sequence.controller.js'
import { SequenceService } from './sequence.service.js'

@Module({
  providers: [SequenceService],
  controllers: [SequenceController],
  imports: [PermissionsModule],
  exports: [SequenceService],
})
export class SequenceModule {}
