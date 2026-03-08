import { MikroORM as LibSqlORM } from '@mikro-orm/libsql'
import { MikroORM as PostgreSqlORM } from '@mikro-orm/postgresql'

import { AssemblyEntity } from './entities/AssemblyEntity'
import { ChangeEntity } from './entities/ChangeEntity'
import { CheckEntity } from './entities/CheckEntity'
import { CheckResultEntity } from './entities/CheckResultEntity'
import { CounterEntity } from './entities/CounterEntity'
import { ExportEntity } from './entities/ExportEntity'
import { FeatureEntity } from './entities/FeatureEntity'
import { FileEntity } from './entities/FileEntity'
import { JBrowseConfigEntity } from './entities/JBrowseConfigEntity'
import { RefSeqChunkEntity } from './entities/RefSeqChunkEntity'
import { RefSeqEntity } from './entities/RefSeqEntity'
import { UserEntity } from './entities/UserEntity'

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
    const generator = orm.getSchemaGenerator()
    await generator.refreshDatabase()
    return orm
  }

  const orm = await LibSqlORM.init({
    entities: allEntities,
    dbName: ':memory:',
  })
  const generator = orm.getSchemaGenerator()
  await generator.createSchema()
  return orm
}
