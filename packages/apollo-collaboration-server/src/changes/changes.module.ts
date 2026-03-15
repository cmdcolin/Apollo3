import { Module } from '@nestjs/common'

import { ChecksModule } from '../checks/checks.module.js'
import { FilesModule } from '../files/files.module.js'
import { MessagesModule } from '../messages/messages.module.js'

import { ChangesController } from './changes.controller.js'
import { ChangesService } from './changes.service.js'

@Module({
  controllers: [ChangesController],
  providers: [ChangesService],
  imports: [FilesModule, MessagesModule, ChecksModule],
})
export class ChangesModule {}
