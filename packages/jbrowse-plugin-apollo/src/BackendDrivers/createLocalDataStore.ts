/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/consistent-type-imports */
import type { ServerDataStore, UnitOfWork } from '@apollo-annotation/common'

import { getElectronRequire } from './electronRequire'

type MikroORM = import('@mikro-orm/core').MikroORM

export function createLocalDataStore(orm: MikroORM): ServerDataStore {
  const electronRequire = getElectronRequire()
  const {
    MikroOrmAssemblyRepository,
    MikroOrmCheckRepository,
    MikroOrmCheckResultRepository,
    MikroOrmFeatureRepository,
    MikroOrmFileRepository,
    MikroOrmJBrowseConfigRepository,
    MikroOrmRefSeqChunkRepository,
    MikroOrmRefSeqRepository,
    MikroOrmUserRepository,
  } = electronRequire(
    '@apollo-annotation/entities',
  ) as typeof import('@apollo-annotation/entities')

  const em = orm.em.fork()

  const unitOfWork: UnitOfWork = {
    async commit() {
      await em.flush()
    },
    async rollback() {
      em.clear()
    },
  }

  return {
    typeName: 'Server',
    featureRepository: new MikroOrmFeatureRepository(em),
    assemblyRepository: new MikroOrmAssemblyRepository(em),
    refSeqRepository: new MikroOrmRefSeqRepository(em),
    refSeqChunkRepository: new MikroOrmRefSeqChunkRepository(em),
    checkRepository: new MikroOrmCheckRepository(em),
    checkResultRepository: new MikroOrmCheckResultRepository(em),
    fileRepository: new MikroOrmFileRepository(em),
    userRepository: new MikroOrmUserRepository(em),
    jbrowseConfigRepository: new MikroOrmJBrowseConfigRepository(em),
    unitOfWork,
    filesService: {
      getFileStream() {
        throw new Error('File service not available in desktop mode')
      },
      getFileHandle() {
        throw new Error('File service not available in desktop mode')
      },
      getDecompressedFileContents() {
        throw new Error('File service not available in desktop mode')
      },
      parseGFF3() {
        throw new Error('File service not available in desktop mode')
      },
      create() {
        throw new Error('File service not available in desktop mode')
      },
      remove() {
        throw new Error('File service not available in desktop mode')
      },
    },
    pluginsService: {
      evaluateExtensionPoint(_extensionPointName, extendee) {
        return extendee
      },
    },
    user: 'desktop-user',
  }
}
