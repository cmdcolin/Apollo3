import { Options } from '@mikro-orm/core'

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

export function createMikroOrmConfig(
  dbType: 'postgresql' | 'sqlite' | 'mongo',
  connectionUrl: string,
) {
  const base: Options = {
    entities: allEntities,
    debug: process.env.MIKRO_ORM_DEBUG === 'true',
  }

  if (dbType === 'postgresql') {
    return {
      ...base,
      type: 'postgresql' as const,
      clientUrl: connectionUrl,
    }
  }
  if (dbType === 'sqlite') {
    return {
      ...base,
      type: 'sqlite' as const,
      dbName: connectionUrl,
    }
  }
  return {
    ...base,
    type: 'mongo' as const,
    clientUrl: connectionUrl,
  }
}
