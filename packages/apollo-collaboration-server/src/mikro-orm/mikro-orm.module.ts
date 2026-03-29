import {
  FeatureHistorySubscriber,
  createMikroOrmConfig,
} from '@apollo-annotation/entities'
import { EntityManager, MikroORM } from '@mikro-orm/core'
import {
  type DynamicModule,
  Inject,
  Injectable,
  Logger,
  Module,
  type OnModuleDestroy,
} from '@nestjs/common'

import { DatabaseService } from './database.service.js'

@Injectable()
class OrmLifecycleService implements OnModuleDestroy {
  private readonly logger = new Logger(OrmLifecycleService.name)
  constructor(@Inject(MikroORM) private readonly orm: MikroORM) {}
  async onModuleDestroy() {
    this.logger.log('Closing MikroORM connection...')
    await this.orm.close()
    this.logger.log('MikroORM connection closed')
  }
}

@Module({})
export class ApolloMikroOrmModule {
  private static readonly logger = new Logger(ApolloMikroOrmModule.name)

  static forRoot(): DynamicModule {
    const dbType = (process.env.DB_BACKEND ?? 'sqlite') as
      | 'postgresql'
      | 'sqlite'
      | 'mongo'
    const connectionUrl = process.env.DB_CONNECTION_URL ?? 'apollo3.sqlite'

    const config = createMikroOrmConfig(dbType, connectionUrl)

    return {
      module: ApolloMikroOrmModule,
      providers: [
        {
          provide: MikroORM,
          useFactory: async () => {
            this.logger.log('Initializing MikroORM...')
            const orm = await MikroORM.init(config)
            if (dbType === 'sqlite') {
              const conn = orm.em.getConnection()
              await conn.execute('PRAGMA foreign_keys = ON')
              if (connectionUrl === ':memory:') {
                this.logger.log('SQLite in-memory mode, foreign keys enabled')
              } else {
                await conn.execute('PRAGMA journal_mode = WAL')
                await conn.execute('PRAGMA synchronous = NORMAL')
                await conn.execute('PRAGMA busy_timeout = 5000')
                this.logger.log(
                  'SQLite foreign keys enabled, WAL mode set, busy_timeout=5000ms',
                )
              }
            }
            this.logger.log('MikroORM initialized, updating schema...')
            await (dbType === 'sqlite' && connectionUrl === ':memory:'
              ? orm.schema.create()
              : orm.schema.update())
            this.logger.log('Schema updated')
            orm.em
              .getEventManager()
              .registerSubscriber(new FeatureHistorySubscriber())
            this.logger.log('FeatureHistorySubscriber registered')
            return orm
          },
        },
        {
          provide: EntityManager,
          useFactory: (orm: MikroORM) => orm.em,
          inject: [MikroORM],
        },
        DatabaseService,
        OrmLifecycleService,
      ],
      exports: [DatabaseService, EntityManager, MikroORM],
      global: true,
    }
  }
}
