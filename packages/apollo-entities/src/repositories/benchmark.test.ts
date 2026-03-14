import { existsSync, unlinkSync } from 'node:fs'

import { MikroORM } from '@mikro-orm/core'
import { NodeSqliteDialect, SqliteDriver } from '@mikro-orm/sqlite'

import { AssemblyEntity } from '../entities/AssemblyEntity.js'
import { ChangeEntity } from '../entities/ChangeEntity.js'
import { CheckEntity } from '../entities/CheckEntity.js'
import { CheckResultEntity } from '../entities/CheckResultEntity.js'
import { CounterEntity } from '../entities/CounterEntity.js'
import { ExportEntity } from '../entities/ExportEntity.js'
import { FeatureEntity } from '../entities/FeatureEntity.js'
import { FileEntity } from '../entities/FileEntity.js'
import { JBrowseConfigEntity } from '../entities/JBrowseConfigEntity.js'
import { RefSeqChunkEntity } from '../entities/RefSeqChunkEntity.js'
import { RefSeqEntity } from '../entities/RefSeqEntity.js'
import { UserEntity } from '../entities/UserEntity.js'
import { MikroOrmAssemblyRepository } from './MikroOrmAssemblyRepository.js'
import { MikroOrmFeatureRepository } from './MikroOrmFeatureRepository.js'
import { MikroOrmRefSeqChunkRepository } from './MikroOrmRefSeqChunkRepository.js'
import { MikroOrmRefSeqRepository } from './MikroOrmRefSeqRepository.js'

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

function generateFeatures(count: number, refSeqId: string, prefix: string) {
  const features = []
  for (let i = 0; i < count; i++) {
    features.push({
      _id: `${prefix}-feat-${i}`,
      refSeq: refSeqId,
      type: i % 3 === 0 ? 'gene' : i % 3 === 1 ? 'mRNA' : 'exon',
      min: i * 100,
      max: i * 100 + 50,
      strand: (i % 2 === 0 ? 1 : -1) as 1 | -1,
      status: -1,
      user: 'benchmark-user',
      attributes: { Name: [`feature-${i}`], ID: [`id-${i}`] },
    })
  }
  return features
}

function generateChunks(count: number, refSeqId: string, prefix: string) {
  const chunks = []
  for (let i = 0; i < count; i++) {
    chunks.push({
      _id: `${prefix}-chunk-${i}`,
      refSeq: refSeqId,
      n: i,
      sequence: 'ATCGATCGATCG'.repeat(100),
      status: -1,
      user: 'benchmark-user',
    })
  }
  return chunks
}

// Simulates the actual import flow: individual refSeq creates/updates,
// chunk batches of 50, feature batches of 500
async function simulateImport(
  em: ReturnType<typeof orm.em.fork>,
  prefix: string,
  refSeqCount: number,
  chunksPerRefSeq: number,
  featuresPerRefSeq: number,
) {
  const asmRepo = new MikroOrmAssemblyRepository(em)
  const rsRepo = new MikroOrmRefSeqRepository(em)
  const chunkRepo = new MikroOrmRefSeqChunkRepository(em)
  const featRepo = new MikroOrmFeatureRepository(em)

  await asmRepo.create({
    _id: `${prefix}-asm`,
    name: `bench-${prefix}`,
    status: -1,
    user: 'u',
  })

  for (let r = 0; r < refSeqCount; r++) {
    const rsId = `${prefix}-rs-${r}`
    await rsRepo.create({
      _id: rsId,
      assembly: `${prefix}-asm`,
      name: `chr${r}`,
      length: 0,
      chunkSize: 20000,
      status: -1,
      user: 'u',
    })

    const chunks = generateChunks(chunksPerRefSeq, rsId, `${prefix}-r${r}`)
    for (let i = 0; i < chunks.length; i += 50) {
      await chunkRepo.createMany(chunks.slice(i, i + 50))
    }

    await rsRepo.updateById(rsId, { length: chunksPerRefSeq * 1200 })

    const features = generateFeatures(featuresPerRefSeq, rsId, `${prefix}-r${r}`)
    for (let i = 0; i < features.length; i += 500) {
      await featRepo.createMany(features.slice(i, i + 500))
    }
  }
}

describe('Benchmark: import simulation with and without transactions', () => {
  const REF_SEQ_COUNT = 3
  const CHUNKS_PER_RS = 100
  const FEATURES_PER_RS = 1500

  it('without transaction (autocommit)', async () => {
    await orm.schema.refresh()
    const em = orm.em.fork()

    const start = performance.now()
    await simulateImport(em, 'no-tx', REF_SEQ_COUNT, CHUNKS_PER_RS, FEATURES_PER_RS)
    const elapsed = performance.now() - start

    console.log(
      `WITHOUT transaction: ${REF_SEQ_COUNT} refSeqs × (${CHUNKS_PER_RS} chunks + ${FEATURES_PER_RS} features) = ${elapsed.toFixed(1)}ms`,
    )
  })

  it('with transaction (single BEGIN/COMMIT)', async () => {
    await orm.schema.refresh()
    const em = orm.em.fork()

    const start = performance.now()
    await em.begin()
    await simulateImport(em, 'tx', REF_SEQ_COUNT, CHUNKS_PER_RS, FEATURES_PER_RS)
    await em.commit()
    const elapsed = performance.now() - start

    console.log(
      `WITH transaction: ${REF_SEQ_COUNT} refSeqs × (${CHUNKS_PER_RS} chunks + ${FEATURES_PER_RS} features) = ${elapsed.toFixed(1)}ms`,
    )
  })
})
