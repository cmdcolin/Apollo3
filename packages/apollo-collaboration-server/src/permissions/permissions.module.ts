import { Module } from '@nestjs/common'

import { PermissionService } from './permission.service.js'
import { PermissionsController } from './permissions.controller.js'

@Module({
  controllers: [PermissionsController],
  providers: [PermissionService],
  exports: [PermissionService],
})
export class PermissionsModule {}
