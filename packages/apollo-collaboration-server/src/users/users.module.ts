import { MikroORM, RequestContext } from '@mikro-orm/core'
import { Inject, Logger, Module, type OnApplicationBootstrap } from '@nestjs/common'

import { MessagesModule } from '../messages/messages.module.js'

import { UsersController } from './users.controller.js'
import { UsersService } from './users.service.js'

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  imports: [MessagesModule],
  exports: [UsersService],
})
export class UsersModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(UsersModule.name)

  constructor(
    @Inject(UsersService) private usersService: UsersService,
    @Inject(MikroORM) private orm: MikroORM,
  ) {}

  async onApplicationBootstrap() {
    this.logger.log('Bootstrapping users database...')
    try {
      await RequestContext.create(this.orm.em, async () => {
        await this.usersService.bootstrapDB()
      })
      this.logger.log('Users database bootstrapped')
    } catch (error) {
      this.logger.error(`Failed to bootstrap users database: ${error}`)
    }
  }
}
