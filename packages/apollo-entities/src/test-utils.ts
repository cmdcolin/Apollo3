import { MikroORM } from '@mikro-orm/core'
import { MikroORM as PostgreSqlORM } from '@mikro-orm/postgresql'
import { NodeSqliteDialect, SqliteDriver } from '@mikro-orm/sqlite'

import { AssemblyEntity } from './entities/AssemblyEntity.js'
import { ChangeEntity } from './entities/ChangeEntity.js'
import { CheckEntity } from './entities/CheckEntity.js'
import { CheckResultEntity } from './entities/CheckResultEntity.js'
import { CounterEntity } from './entities/CounterEntity.js'
import { ExportEntity } from './entities/ExportEntity.js'
import { FeatureEntity } from './entities/FeatureEntity.js'
import { FileEntity } from './entities/FileEntity.js'
import { JBrowseConfigEntity } from './entities/JBrowseConfigEntity.js'
import { RefSeqChunkEntity } from './entities/RefSeqChunkEntity.js'
import { RefSeqEntity } from './entities/RefSeqEntity.js'
import { UserEntity } from './entities/UserEntity.js'

const allEntities = [
  AssemblyEntity,
  ChangeEntity,
  CheckEntity,
  CheckResultEntity,
  CounterEntity,
  ExportEntity,
  FeatureEntity,
  FileEntity,
  JBrowseConfigEntity,
  RefSeqChunkEntity,
  RefSeqEntity,
  UserEntity,
]

export async function createTestORM() {
  const dbBackend = process.env.DB_BACKEND
  const connectionUrl = process.env.DB_CONNECTION_URL

  if (dbBackend === 'postgresql' && connectionUrl) {
    const orm = await PostgreSqlORM.init({
      entities: allEntities,
      clientUrl: connectionUrl,
    })
    await orm.schema.refresh()
    return orm
  }

  const orm = await MikroORM.init({
    driver: SqliteDriver,
    dbName: ':memory:',
    driverOptions: new NodeSqliteDialect(':memory:'),
    entities: allEntities,
  })
  await orm.schema.create()
  return orm
}
