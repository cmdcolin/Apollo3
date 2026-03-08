import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common'

import { MessagesModule } from '../messages/messages.module'

import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  imports: [MessagesModule],
  exports: [UsersService],
})
export class UsersModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersModule.name)

  constructor(private usersService: UsersService) {}
  async onApplicationBootstrap() {
    this.logger.log('Bootstrapping users database...')
    try {
      await this.usersService.bootstrapDB()
      this.logger.log('Users database bootstrapped')
    } catch (error) {
      this.logger.error(`Failed to bootstrap users database: ${error}`)
    }
  }
}
