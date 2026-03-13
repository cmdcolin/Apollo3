import { createMikroOrmConfig } from '@apollo-annotation/entities'
import { MikroORM, EntityManager } from '@mikro-orm/core'
import { type DynamicModule, Logger, Module } from '@nestjs/common'

import { DatabaseService } from './database.service.js'

@Module({})
export class ApolloMikroOrmModule {
  private static readonly logger = new Logger(ApolloMikroOrmModule.name)

  static forRoot(): DynamicModule {
    const dbType = (process.env.DB_BACKEND ?? 'sqlite') as
      | 'postgresql'
      | 'sqlite'
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
            if (dbType === 'sqlite') {
              await orm.em.execute('PRAGMA foreign_keys = ON')
              this.logger.log('SQLite foreign keys enabled')
            }
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
