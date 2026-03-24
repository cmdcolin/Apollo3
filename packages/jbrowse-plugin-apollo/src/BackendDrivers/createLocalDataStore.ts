/* eslint-disable @typescript-eslint/consistent-type-imports */
import type { ServerDataStore } from '@apollo-annotation/common'

import { getElectronRequire } from './electronRequire'

type EntityManager = import('@mikro-orm/core').EntityManager

export function createLocalDataStore(em: EntityManager): ServerDataStore {
  const electronRequire = getElectronRequire()
  const {
    MikroOrmAssemblyRepository,
    MikroOrmCheckRepository,
    MikroOrmCheckResultRepository,
    MikroOrmFeatureRepository,
    MikroOrmRefSeqRepository,
    MikroOrmUserRepository,
  } = electronRequire(
    '@apollo-annotation/entities',
  ) as typeof import('@apollo-annotation/entities')

  return {
    typeName: 'Server',
    featureRepository: new MikroOrmFeatureRepository(em),
    assemblyRepository: new MikroOrmAssemblyRepository(em),
    refSeqRepository: new MikroOrmRefSeqRepository(em),
    checkRepository: new MikroOrmCheckRepository(em),
    checkResultRepository: new MikroOrmCheckResultRepository(em),
    userRepository: new MikroOrmUserRepository(em),
    parseGFF3() {
      throw new Error('GFF3 parsing not available in desktop mode')
    },
    pluginsService: {
      evaluateExtensionPoint(_extensionPointName, extendee) {
        return extendee
      },
    },
    user: 'desktop-user',
  }
}
