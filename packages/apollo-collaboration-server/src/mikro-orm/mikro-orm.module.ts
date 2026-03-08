import { createMikroOrmConfig } from '@apollo-annotation/entities'
import { MikroORM } from '@mikro-orm/core'
import { EntityManager } from '@mikro-orm/core'
import { DynamicModule, Logger, Module } from '@nestjs/common'

import { DatabaseService } from './database.service'

@Module({})
export class ApolloMikroOrmModule {
  private static readonly logger = new Logger(ApolloMikroOrmModule.name)

  static forRoot(): DynamicModule {
    const dbBackend = process.env.DB_BACKEND
    if (!dbBackend || dbBackend === 'mongodb') {
      return {
        module: ApolloMikroOrmModule,
        providers: [DatabaseService],
        exports: [DatabaseService],
        global: true,
      }
    }

    const dbType = dbBackend as 'postgresql' | 'sqlite' | 'mongo'
    const connectionUrl = process.env.DB_CONNECTION_URL ?? 'apollo3.sqlite'

    const config = createMikroOrmConfig(dbType, connectionUrl)

    return {
      module: ApolloMikroOrmModule,
      providers: [
        {
          provide: MikroORM,
          useFactory: async () => {
            this.logger.log('Initializing MikroORM...')
            const orm = await MikroORM.init({
              ...config,
              allowGlobalContext: true,
            })
            this.logger.log('MikroORM initialized, updating schema...')
            const generator = orm.getSchemaGenerator()
            await generator.updateSchema()
            this.logger.log('Schema updated')
            return orm
          },
        },
        {
          provide: EntityManager,
          useFactory: (orm: MikroORM) => orm.em,
          inject: [MikroORM],
        },
        DatabaseService,
      ],
      exports: [DatabaseService, EntityManager, MikroORM],
      global: true,
    }
  }
}
