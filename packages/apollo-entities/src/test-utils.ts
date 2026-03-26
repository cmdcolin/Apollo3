import type { MikroORM as BaseMikroORM } from '@mikro-orm/core'
import { MikroORM } from '@mikro-orm/core'
import { MikroORM as PostgreSqlORM } from '@mikro-orm/postgresql'
import { NodeSqliteDialect, SqliteDriver } from '@mikro-orm/sqlite'

import { AssemblyEntity } from './entities/AssemblyEntity.js'
import { AssemblyPermissionEntity } from './entities/AssemblyPermissionEntity.js'
import { CheckEntity } from './entities/CheckEntity.js'
import { CheckResultEntity } from './entities/CheckResultEntity.js'
import { CounterEntity } from './entities/CounterEntity.js'
import { ExportEntity } from './entities/ExportEntity.js'
import { FeatureEntity } from './entities/FeatureEntity.js'
import { FeatureHistoryEntity } from './entities/FeatureHistoryEntity.js'
import { FileEntity } from './entities/FileEntity.js'
import { OrganismEntity } from './entities/OrganismEntity.js'
import { RefSeqEntity } from './entities/RefSeqEntity.js'
import { TextSearchAdapterConfigEntity } from './entities/TextSearchAdapterConfigEntity.js'
import { TrackConfigEntity } from './entities/TrackConfigEntity.js'
import { UserEntity } from './entities/UserEntity.js'
import { FeatureHistorySubscriber } from './subscribers/FeatureHistorySubscriber.js'

const allEntities = [
  AssemblyEntity,
  AssemblyPermissionEntity,
  CheckEntity,
  CheckResultEntity,
  CounterEntity,
  ExportEntity,
  FeatureEntity,
  FeatureHistoryEntity,
  FileEntity,
  OrganismEntity,
  RefSeqEntity,
  TextSearchAdapterConfigEntity,
  TrackConfigEntity,
  UserEntity,
]

function registerSubscribers(orm: BaseMikroORM) {
  orm.em.getEventManager().registerSubscriber(new FeatureHistorySubscriber())
}

export async function createTestORM() {
  const dbBackend = process.env.DB_BACKEND
  const connectionUrl = process.env.DB_CONNECTION_URL

  if (dbBackend === 'postgresql' && connectionUrl) {
    const orm = await PostgreSqlORM.init({
      entities: allEntities,
      clientUrl: connectionUrl,
    })
    await orm.schema.refresh()
    registerSubscribers(orm)
    return orm
  }

  const orm = await MikroORM.init({
    driver: SqliteDriver,
    dbName: ':memory:',
    driverOptions: new NodeSqliteDialect(':memory:'),
    entities: allEntities,
  })
  await orm.schema.create()
  registerSubscribers(orm)
  return orm
}
