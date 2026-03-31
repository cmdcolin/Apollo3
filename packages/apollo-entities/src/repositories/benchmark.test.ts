import { existsSync, unlinkSync } from 'node:fs'

import { MikroORM } from '@mikro-orm/core'
import { NodeSqliteDialect, SqliteDriver } from '@mikro-orm/sqlite'

import { AssemblyEntity } from '../entities/AssemblyEntity.js'
import { CheckEntity } from '../entities/CheckEntity.js'
import { CheckResultEntity } from '../entities/CheckResultEntity.js'
import { CounterEntity } from '../entities/CounterEntity.js'
import { ExportEntity } from '../entities/ExportEntity.js'
import { FeatureEntity } from '../entities/FeatureEntity.js'
import { FileEntity } from '../entities/FileEntity.js'
import { OrganismEntity } from '../entities/OrganismEntity.js'
import { UserEntity } from '../entities/UserEntity.js'
import { MikroOrmAssemblyRepository } from './MikroOrmAssemblyRepository.js'
import { MikroOrmFeatureRepository } from './MikroOrmFeatureRepository.js'

const allEntities = [
  AssemblyEntity,
  CheckEntity,
  CheckResultEntity,
  CounterEntity,
  ExportEntity,
  FeatureEntity,
  FileEntity,
  OrganismEntity,
  UserEntity,
]

const DB_PATH = '/tmp/benchmark-test.sqlite'

let orm: MikroORM

beforeAll(async () => {
  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH)
  }
  orm = await MikroORM.init({
    driver: SqliteDriver,
    dbName: DB_PATH,
    driverOptions: new NodeSqliteDialect(DB_PATH),
    entities: allEntities,
  })
  await orm.em.getConnection().execute('PRAGMA journal_mode = WAL')
  await orm.em.getConnection().execute('PRAGMA synchronous = NORMAL')
  await orm.schema.create()
})

afterAll(async () => {
  await orm.close(true)
  if (existsSync(DB_PATH)) {
    unlinkSync(DB_PATH)
  }
})

function generateFeatures(count: number, refSeqId: string, prefix: string, assembly: string) {
  const features = []
  for (let i = 0; i < count; i++) {
    features.push({
      _id: `${prefix}-feat-${i}`,
      assembly,
      refSeq: refSeqId,
      type: i % 3 === 0 ? 'gene' : i % 3 === 1 ? 'mRNA' : 'exon',
      min: i * 100,
      max: i * 100 + 50,
      strand: (i % 2 === 0 ? 1 : -1) as 1 | -1,

      attributes: { Name: [`feature-${i}`], ID: [`id-${i}`] },
    })
  }
  return features
}

// Simulates the actual import flow: individual refSeq creates/updates,
// feature batches of 500
async function simulateImport(
  em: ReturnType<typeof orm.em.fork>,
  prefix: string,
  refSeqCount: number,
  featuresPerRefSeq: number,
) {
  const asmRepo = new MikroOrmAssemblyRepository(em)
  const featRepo = new MikroOrmFeatureRepository(em)

  await asmRepo.create({
    _id: `${prefix}-asm`,
    name: `bench-${prefix}`,
  })

  for (let r = 0; r < refSeqCount; r++) {
    const rsName = `chr${r}`

    const features = generateFeatures(
      featuresPerRefSeq,
      rsName,
      `${prefix}-r${r}`,
      `${prefix}-asm`,
    )
    for (let i = 0; i < features.length; i += 500) {
      await featRepo.createMany(features.slice(i, i + 500))
    }
  }
}

describe('Benchmark: import simulation with and without transactions', () => {
  const REF_SEQ_COUNT = 3
  const FEATURES_PER_RS = 1500

  it('without transaction (autocommit)', async () => {
    await orm.schema.refresh()
    const em = orm.em.fork()

    const start = performance.now()
    await simulateImport(em, 'no-tx', REF_SEQ_COUNT, FEATURES_PER_RS)
    const elapsed = performance.now() - start

    console.log(
      `WITHOUT transaction: ${REF_SEQ_COUNT} refSeqs × ${FEATURES_PER_RS} features = ${elapsed.toFixed(1)}ms`,
    )
  })

  it('with transaction (single BEGIN/COMMIT)', async () => {
    await orm.schema.refresh()
    const em = orm.em.fork()

    const start = performance.now()
    await em.begin()
    await simulateImport(em, 'tx', REF_SEQ_COUNT, FEATURES_PER_RS)
    await em.commit()
    const elapsed = performance.now() - start

    console.log(
      `WITH transaction: ${REF_SEQ_COUNT} refSeqs × ${FEATURES_PER_RS} features = ${elapsed.toFixed(1)}ms`,
    )
  })
})
