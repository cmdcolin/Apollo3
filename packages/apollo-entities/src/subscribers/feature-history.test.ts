import type { MikroORM } from '@mikro-orm/core'

import { FeatureHistoryEntity } from '../entities/FeatureHistoryEntity.js'
import { createTestORM } from '../test-utils.js'
import { MikroOrmAssemblyRepository } from '../repositories/MikroOrmAssemblyRepository.js'
import { MikroOrmFeatureRepository } from '../repositories/MikroOrmFeatureRepository.js'
import { MikroOrmRefSeqRepository } from '../repositories/MikroOrmRefSeqRepository.js'

let orm: MikroORM

beforeAll(async () => {
  orm = await createTestORM()
})

afterAll(async () => {
  await orm.close(true)
})

beforeEach(async () => {
  await orm.schema.refresh()
})

async function setupAssemblyAndRefSeq(em = orm.em.fork()) {
  const assemblyRepo = new MikroOrmAssemblyRepository(em)
  const refSeqRepo = new MikroOrmRefSeqRepository(em)
  await assemblyRepo.create({ _id: 'asm-1', name: 'test-assembly' })
  await refSeqRepo.create({
    _id: 'rs-1',
    name: 'chr1',
    assembly: 'asm-1',
    length: 10_000,
  })
  return em
}

async function getHistoryRecords(em = orm.em.fork()) {
  return em.find(
    FeatureHistoryEntity,
    {},
    { orderBy: { changedAt: 'ASC' } },
  )
}

describe('FeatureHistorySubscriber', () => {
  it('records history on feature create', async () => {
    const em = await setupAssemblyAndRefSeq()
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'feat-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      strand: 1,
    })

    const history = await getHistoryRecords()
    expect(history).toHaveLength(1)
    expect(history[0].featureId).toBe('feat-1')
    expect(history[0].changeType).toBe('insert')
    expect(history[0].type).toBe('gene')
    expect(history[0].min).toBe(100)
    expect(history[0].max).toBe(500)
    expect(history[0].strand).toBe(1)
    expect(history[0].refSeq).toBe('rs-1')
  })

  it('records history on feature update with previous values', async () => {
    const em = await setupAssemblyAndRefSeq()
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'feat-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      strand: 1,
    })

    await featureRepo.updateById('feat-1', { min: 200 })

    const history = await getHistoryRecords()
    expect(history).toHaveLength(2)

    const insertRecord = history[0]
    expect(insertRecord.changeType).toBe('insert')
    expect(insertRecord.min).toBe(100)

    const updateRecord = history[1]
    expect(updateRecord.changeType).toBe('update')
    expect(updateRecord.min).toBe(100)
    expect(updateRecord.featureId).toBe('feat-1')
  })

  it('records history on feature delete', async () => {
    const em = await setupAssemblyAndRefSeq()
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'feat-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })

    await featureRepo.deleteById('feat-1')

    const history = await getHistoryRecords()
    expect(history).toHaveLength(2)

    const deleteRecord = history[1]
    expect(deleteRecord.changeType).toBe('delete')
    expect(deleteRecord.featureId).toBe('feat-1')
    expect(deleteRecord.type).toBe('gene')
    expect(deleteRecord.min).toBe(100)
    expect(deleteRecord.max).toBe(500)
  })

  it('records multiple updates preserving history', async () => {
    const em = await setupAssemblyAndRefSeq()
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'feat-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })

    await featureRepo.updateById('feat-1', { min: 200 })
    await featureRepo.updateById('feat-1', { max: 600 })
    await featureRepo.updateById('feat-1', { type: 'mRNA' })

    const history = await getHistoryRecords()
    // insert + 3 updates
    expect(history).toHaveLength(4)
    expect(history.map((h) => h.changeType)).toEqual([
      'insert',
      'update',
      'update',
      'update',
    ])
    // each update record captures the state before the update
    expect(history[1].min).toBe(100)
    expect(history[2].max).toBe(500)
    expect(history[3].type).toBe('gene')
  })
})
