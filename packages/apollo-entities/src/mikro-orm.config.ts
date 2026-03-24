import { NodeSqliteDialect, SqliteDriver } from '@mikro-orm/sqlite'

import { AnalysisDbEntity } from './entities/AnalysisDbEntity.js'
import { AnalysisJobEntity } from './entities/AnalysisJobEntity.js'
import { AssemblyEntity } from './entities/AssemblyEntity.js'
import { AssemblyPermissionEntity } from './entities/AssemblyPermissionEntity.js'
import { ChangeEntity } from './entities/ChangeEntity.js'
import { CheckEntity } from './entities/CheckEntity.js'
import { CheckResultEntity } from './entities/CheckResultEntity.js'
import { CounterEntity } from './entities/CounterEntity.js'
import { ExportEntity } from './entities/ExportEntity.js'
import { FeatureEntity } from './entities/FeatureEntity.js'
import { FileEntity } from './entities/FileEntity.js'
import { OrganismEntity } from './entities/OrganismEntity.js'
import { RefSeqEntity } from './entities/RefSeqEntity.js'
import { TextSearchAdapterConfigEntity } from './entities/TextSearchAdapterConfigEntity.js'
import { TrackConfigEntity } from './entities/TrackConfigEntity.js'
import { UserEntity } from './entities/UserEntity.js'

const allEntities = [
  AnalysisDbEntity,
  AnalysisJobEntity,
  AssemblyEntity,
  AssemblyPermissionEntity,
  ChangeEntity,
  OrganismEntity,
  CheckEntity,
  CheckResultEntity,
  CounterEntity,
  ExportEntity,
  FeatureEntity,
  FileEntity,
  RefSeqEntity,
  TextSearchAdapterConfigEntity,
  TrackConfigEntity,
  UserEntity,
]

export function createMikroOrmConfig(
  dbType: 'postgresql' | 'sqlite' | 'mongo',
  connectionUrl: string,
) {
  const base = {
    entities: allEntities,
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  }

  if (dbType === 'sqlite') {
    return {
      ...base,
      driver: SqliteDriver,
      dbName: connectionUrl,
      driverOptions: new NodeSqliteDialect(connectionUrl),
    }
  }
  // PostgreSQL and MongoDB: MikroORM auto-detects the driver from the
  // clientUrl scheme (postgresql://, mongodb://, etc.)
  return {
    ...base,
    clientUrl: connectionUrl,
  }
}
