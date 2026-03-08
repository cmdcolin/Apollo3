import { Module } from '@nestjs/common'

import { CountersModule } from '../counters/counters.module.js'
import { FilesModule } from '../files/files.module.js'
import { MessagesModule } from '../messages/messages.module.js'

import { ChangesController } from './changes.controller.js'
import { ChangesService } from './changes.service.js'

@Module({
  controllers: [ChangesController],
  providers: [ChangesService],
  imports: [FilesModule, CountersModule, MessagesModule],
})
export class ChangesModule {}
