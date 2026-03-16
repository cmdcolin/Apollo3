import { Module } from '@nestjs/common'

import { PermissionsModule } from '../permissions/permissions.module.js'

import { TracksController } from './tracks.controller.js'

@Module({
  controllers: [TracksController],
  imports: [PermissionsModule],
})
export class TracksModule {}
