import { Global, Module } from '@nestjs/common'

import { MessagesModule } from '../messages/messages.module.js'

import { ActiveUsersService } from './active-users.service.js'
import { UsersController } from './users.controller.js'
import { UsersService } from './users.service.js'

@Global()
@Module({
  controllers: [UsersController],
  providers: [UsersService, ActiveUsersService],
  imports: [MessagesModule],
  exports: [UsersService, ActiveUsersService],
})
export class UsersModule {}
