import { Module } from '@nestjs/common'

import { CountersModule } from '../counters/counters.module'
import { FilesModule } from '../files/files.module'
import { MessagesModule } from '../messages/messages.module'

import { ChangesController } from './changes.controller'
import { ChangesService } from './changes.service'

@Module({
  controllers: [ChangesController],
  providers: [ChangesService],
  imports: [FilesModule, CountersModule, MessagesModule],
})
export class ChangesModule {}
