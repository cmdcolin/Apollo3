import { Module } from '@nestjs/common'

import { PermissionsModule } from '../permissions/permissions.module.js'

import { RefSeqsController } from './refSeqs.controller.js'
import { RefSeqsService } from './refSeqs.service.js'

@Module({
  imports: [PermissionsModule],
  exports: [RefSeqsService],
  controllers: [RefSeqsController],
  providers: [RefSeqsService],
})
export class RefSeqsModule {}
