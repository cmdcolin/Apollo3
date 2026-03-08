import { User, UserSchema } from '@apollo-annotation/schemas'
import { Logger, Module, OnApplicationBootstrap } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { MessagesModule } from '../messages/messages.module'
import { useMongoose } from '../utils/constants'

import { UsersController } from './users.controller'
import { UsersService } from './users.service'

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  imports: [
    ...(useMongoose
      ? [MongooseModule.forFeature([{ name: User.name, schema: UserSchema }])]
      : []),
    MessagesModule,
  ],
  exports: [UsersService, ...(useMongoose ? [MongooseModule] : [])],
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
