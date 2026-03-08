import type { Options } from '@mikro-orm/core'
import { defineConfig as defineLibSqlConfig } from '@mikro-orm/libsql'

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

export function createMikroOrmConfig(
  dbType: 'postgresql' | 'sqlite' | 'mongo',
  connectionUrl: string,
): Options {
  const base = {
    entities: allEntities,
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  }

  if (dbType === 'sqlite') {
    return defineLibSqlConfig({
      ...base,
      dbName: connectionUrl,
    })
  }
  return {
    ...base,
    clientUrl: connectionUrl,
  }
}
