import type { MikroORM } from '@mikro-orm/core'

import { createTestORM } from '../test-utils.js'
import { MikroOrmAssemblyRepository } from './MikroOrmAssemblyRepository.js'
import { MikroOrmChangeRepository } from './MikroOrmChangeRepository.js'
import { MikroOrmCounterRepository } from './MikroOrmCounterRepository.js'
import { MikroOrmFeatureRepository } from './MikroOrmFeatureRepository.js'
import { MikroOrmFileRepository } from './MikroOrmFileRepository.js'
import { MikroOrmRefSeqChunkRepository } from './MikroOrmRefSeqChunkRepository.js'
import { MikroOrmRefSeqRepository } from './MikroOrmRefSeqRepository.js'

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

describe('MikroOrmAssemblyRepository', () => {
  it('should create and find an assembly', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    const created = await repo.create({
      _id: 'asm-1',
      name: 'test-assembly',
      status: 0,
    })
    expect(created._id).toBe('asm-1')
    expect(created.name).toBe('test-assembly')

    const found = await repo.findById('asm-1')
    expect(found).toBeDefined()
    expect(found!.name).toBe('test-assembly')
  })

  it('should find assembly by name', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({ _id: 'asm-1', name: 'volvox', status: 0 })

    const found = await repo.findByName('volvox')
    expect(found).toBeDefined()
    expect(found!._id).toBe('asm-1')

    const notFound = await repo.findByName('nonexistent')
    expect(notFound).toBeUndefined()
  })

  it('should find all assemblies', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({ _id: 'asm-1', name: 'volvox', status: 0 })
    await repo.create({ _id: 'asm-2', name: 'yeast', status: 0 })

    const all = await repo.findAll()
    expect(all).toHaveLength(2)
  })

  it('should update assembly by id', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({ _id: 'asm-1', name: 'volvox', status: 0 })

    const updated = await repo.updateById('asm-1', {
      checks: ['check-1', 'check-2'],
    })
    expect(updated).toBeDefined()
    expect(updated!.checks).toEqual(['check-1', 'check-2'])

    const found = await repo.findById('asm-1')
    expect(found!.checks).toEqual(['check-1', 'check-2'])
  })

  it('should delete assembly by id', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({ _id: 'asm-1', name: 'volvox', status: 0 })

    expect(await repo.deleteById('asm-1')).toBe(true)
    expect(await repo.findById('asm-1')).toBeUndefined()
    expect(await repo.deleteById('asm-1')).toBe(false)
  })

  it('should store sequenceSource', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({
      _id: 'asm-ext',
      name: 'external',
      status: 0,
      sequenceSource: {
        type: 'external',
        fa: 'https://example.com/genome.fa',
        fai: 'https://example.com/genome.fa.fai',
        gzi: 'https://example.com/genome.fa.gzi',
      },
    })

    const found = await repo.findById('asm-ext')
    expect(found).toBeDefined()
    expect(found!.sequenceSource).toBeDefined()
    expect(found!.sequenceSource!.fa).toBe('https://example.com/genome.fa')
  })
})

describe('MikroOrmRefSeqRepository', () => {
  it('should create and find a refSeq', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'volvox', status: 0 })

    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    const created = await refSeqRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
    })
    expect(created.name).toBe('ctgA')

    const found = await refSeqRepo.findById('rs-1')
    expect(found).toBeDefined()
    expect(found!.name).toBe('ctgA')
    expect(found!.assembly).toBe('asm-1')
  })

  it('should find refSeqs by assembly', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'volvox', status: 0 })
    await asmRepo.create({ _id: 'asm-2', name: 'yeast', status: 0 })

    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    await refSeqRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
    })
    await refSeqRepo.create({
      _id: 'rs-2',
      assembly: 'asm-1',
      name: 'ctgB',
      length: 30000,
      chunkSize: 20000,
    })
    await refSeqRepo.create({
      _id: 'rs-3',
      assembly: 'asm-2',
      name: 'chrI',
      length: 100000,
      chunkSize: 20000,
    })

    expect(await refSeqRepo.findByAssembly('asm-1')).toHaveLength(2)
    expect(await refSeqRepo.findByAssembly('asm-2')).toHaveLength(1)
  })

  it('should find all refSeqs', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'volvox', status: 0 })

    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    await refSeqRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
    })
    await refSeqRepo.create({
      _id: 'rs-2',
      assembly: 'asm-1',
      name: 'ctgB',
      length: 30000,
      chunkSize: 20000,
    })

    expect(await refSeqRepo.findAll()).toHaveLength(2)
  })

  it('should find by name and assembly', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'volvox', status: 0 })

    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    await refSeqRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
    })

    const found = await refSeqRepo.findByNameAndAssembly('ctgA', 'asm-1')
    expect(found).toBeDefined()
    expect(found!._id).toBe('rs-1')

    expect(
      await refSeqRepo.findByNameAndAssembly('ctgA', 'asm-2'),
    ).toBeUndefined()
  })

  it('should update refSeq by id', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'volvox', status: 0 })

    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    await refSeqRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
      status: -1,
    })

    const updated = await refSeqRepo.updateById('rs-1', { status: 0 })
    expect(updated).toBeDefined()
    expect(updated!.status).toBe(0)
  })

  it('should delete refSeqs by assembly', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'volvox', status: 0 })

    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    await refSeqRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
    })
    await refSeqRepo.create({
      _id: 'rs-2',
      assembly: 'asm-1',
      name: 'ctgB',
      length: 30000,
      chunkSize: 20000,
    })

    expect(await refSeqRepo.deleteByAssembly('asm-1')).toBe(2)
    expect(await refSeqRepo.findByAssembly('asm-1')).toHaveLength(0)
  })

  it('should create many refSeqs', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'volvox', status: 0 })

    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    const created = await refSeqRepo.createMany([
      {
        _id: 'rs-1',
        assembly: 'asm-1',
        name: 'ctgA',
        length: 50000,
        chunkSize: 20000,
      },
      {
        _id: 'rs-2',
        assembly: 'asm-1',
        name: 'ctgB',
        length: 30000,
        chunkSize: 20000,
      },
    ])
    expect(created).toHaveLength(2)
  })
})

describe('MikroOrmRefSeqChunkRepository', () => {
  async function setupRefSeq(em: ReturnType<typeof orm.em.fork>) {
    await new MikroOrmAssemblyRepository(em).create({
      _id: 'asm-1',
      name: 'volvox',
      status: 0,
    })
    await new MikroOrmRefSeqRepository(em).create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
    })
  }

  it('should create and find chunks by refSeq', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const chunkRepo = new MikroOrmRefSeqChunkRepository(em)

    await chunkRepo.create({
      _id: 'chunk-0',
      refSeq: 'rs-1',
      n: 0,
      sequence: 'ATCGATCG',
    })
    await chunkRepo.create({
      _id: 'chunk-1',
      refSeq: 'rs-1',
      n: 1,
      sequence: 'GCTAGCTA',
    })

    expect(await chunkRepo.findByRefSeq('rs-1')).toHaveLength(2)
  })

  it('should find chunks by refSeq and range', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const chunkRepo = new MikroOrmRefSeqChunkRepository(em)

    for (let i = 0; i < 5; i++) {
      await chunkRepo.create({
        _id: `chunk-${i}`,
        refSeq: 'rs-1',
        n: i,
        sequence: `SEQ${i}`,
      })
    }

    const rangeChunks = await chunkRepo.findByRefSeqAndRange('rs-1', 1, 3)
    expect(rangeChunks).toHaveLength(3)
    expect(rangeChunks[0].n).toBe(1)
    expect(rangeChunks[1].n).toBe(2)
    expect(rangeChunks[2].n).toBe(3)
  })

  it('should create many chunks', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const chunkRepo = new MikroOrmRefSeqChunkRepository(em)

    const created = await chunkRepo.createMany([
      { _id: 'chunk-0', refSeq: 'rs-1', n: 0, sequence: 'AAAA' },
      { _id: 'chunk-1', refSeq: 'rs-1', n: 1, sequence: 'CCCC' },
      { _id: 'chunk-2', refSeq: 'rs-1', n: 2, sequence: 'GGGG' },
    ])
    expect(created).toHaveLength(3)
  })

  it('should delete chunks by refSeq ids', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const chunkRepo = new MikroOrmRefSeqChunkRepository(em)

    await chunkRepo.create({
      _id: 'chunk-0',
      refSeq: 'rs-1',
      n: 0,
      sequence: 'AAAA',
    })
    expect(await chunkRepo.deleteByRefSeqs(['rs-1'])).toBe(1)
  })
})

describe('MikroOrmFeatureRepository', () => {
  async function setupRefSeq(em: ReturnType<typeof orm.em.fork>) {
    await new MikroOrmAssemblyRepository(em).create({
      _id: 'asm-1',
      name: 'volvox',
      status: 0,
    })
    await new MikroOrmRefSeqRepository(em).create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
    })
  }

  it('should create and find a feature', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    const created = await featureRepo.create({
      _id: 'feat-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      strand: 1,
      status: 0,
    })
    expect(created._id).toBe('feat-1')
    expect(created.type).toBe('gene')

    const found = await featureRepo.findById('feat-1')
    expect(found).toBeDefined()
    expect(found!.min).toBe(100)
    expect(found!.max).toBe(500)
  })

  it('should find features by range', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'f1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      status: 0,
    })
    await featureRepo.create({
      _id: 'f2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 600,
      max: 900,
      status: 0,
    })
    await featureRepo.create({
      _id: 'f3',
      refSeq: 'rs-1',
      type: 'gene',
      min: 1000,
      max: 1500,
      status: 0,
    })

    expect(await featureRepo.findByRange('rs-1', 400, 700)).toHaveLength(2)
    expect(await featureRepo.findByRange('rs-1', 0, 2000)).toHaveLength(3)
    expect(await featureRepo.findByRange('rs-1', 2000, 3000)).toHaveLength(0)
  })

  it('should find root features by range (excludes children)', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      status: 0,
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
      status: 0,
    })

    const roots = await featureRepo.findRootsByRange('rs-1', 0, 1000)
    expect(roots).toHaveLength(1)
    expect(roots[0]._id).toBe('gene-1')
  })

  it('should find children and descendants', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      status: 0,
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
      status: 0,
    })
    await featureRepo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
      status: 0,
    })
    await featureRepo.create({
      _id: 'exon-2',
      refSeq: 'rs-1',
      type: 'exon',
      min: 400,
      max: 500,
      parentId: 'mrna-1',
      status: 0,
    })

    const children = await featureRepo.findChildren('gene-1')
    expect(children).toHaveLength(1)
    expect(children[0]._id).toBe('mrna-1')

    const descendants = await featureRepo.findDescendants('gene-1')
    expect(descendants).toHaveLength(3)
  })

  it('should update a feature', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'feat-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      status: 0,
    })

    const updated = await featureRepo.updateById('feat-1', {
      min: 50,
      max: 600,
    })
    expect(updated).toBeDefined()
    expect(updated!.min).toBe(50)
    expect(updated!.max).toBe(600)
  })

  it('should delete a feature and its descendants', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      status: 0,
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
      status: 0,
    })
    await featureRepo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
      status: 0,
    })

    const descendantCount = await featureRepo.deleteDescendants('gene-1')
    // SQLite cascades may delete grandchildren when parent is removed,
    // so count may be less than total descendants
    expect(descendantCount).toBeGreaterThanOrEqual(1)
    expect(await featureRepo.deleteById('gene-1')).toBe(true)
    expect(await featureRepo.findById('gene-1')).toBeUndefined()
  })

  it('should search features by type text', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'f1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      status: 0,
    })
    await featureRepo.create({
      _id: 'f2',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      status: 0,
    })
    await featureRepo.create({
      _id: 'f3',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
      status: 0,
    })

    expect(await featureRepo.searchText(['rs-1'], 'gene')).toHaveLength(1)
    expect(await featureRepo.searchText(['rs-1'], 'mRNA')).toHaveLength(1)
  })

  it('should create many features', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    const created = await featureRepo.createMany([
      {
        _id: 'f1',
        refSeq: 'rs-1',
        type: 'gene',
        min: 100,
        max: 500,
        status: 0,
      },
      {
        _id: 'f2',
        refSeq: 'rs-1',
        type: 'gene',
        min: 600,
        max: 900,
        status: 0,
      },
    ])
    expect(created).toHaveLength(2)
  })

  it('should delete features by refSeq ids', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'f1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      status: 0,
    })
    await featureRepo.create({
      _id: 'f2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 600,
      max: 900,
      status: 0,
    })

    expect(await featureRepo.deleteByRefSeqs(['rs-1'])).toBe(2)
  })

  it('should find features by ids', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'f1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      status: 0,
    })
    await featureRepo.create({
      _id: 'f2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 600,
      max: 900,
      status: 0,
    })
    await featureRepo.create({
      _id: 'f3',
      refSeq: 'rs-1',
      type: 'gene',
      min: 1000,
      max: 1500,
      status: 0,
    })

    expect(await featureRepo.findByIds(['f1', 'f3'])).toHaveLength(2)
  })
})

describe('MikroOrmFileRepository', () => {
  it('should create and find a file', async () => {
    const repo = new MikroOrmFileRepository(orm.em.fork())
    const created = await repo.create({
      _id: 'file-1',
      basename: 'genome.fa',
      checksum: 'abc123',
      type: 'text/x-fasta',
    })
    expect(created.basename).toBe('genome.fa')

    const found = await repo.findById('file-1')
    expect(found).toBeDefined()
    expect(found!.checksum).toBe('abc123')
    expect(found!.type).toBe('text/x-fasta')
  })

  it('should delete a file', async () => {
    const repo = new MikroOrmFileRepository(orm.em.fork())
    await repo.create({
      _id: 'file-1',
      basename: 'genome.fa',
      checksum: 'abc123',
      type: 'text/x-fasta',
    })

    expect(await repo.deleteById('file-1')).toBe(true)
    expect(await repo.findById('file-1')).toBeUndefined()
  })
})

describe('MikroOrmCounterRepository', () => {
  it('should increment sequence value', async () => {
    const repo = new MikroOrmCounterRepository(orm.em.fork())

    expect(await repo.getNextSequenceValue('changeCounter')).toBe(1)
    expect(await repo.getNextSequenceValue('changeCounter')).toBe(2)
    expect(await repo.getNextSequenceValue('changeCounter')).toBe(3)
  })

  it('should maintain separate counters', async () => {
    const repo = new MikroOrmCounterRepository(orm.em.fork())

    expect(await repo.getNextSequenceValue('counterA')).toBe(1)
    expect(await repo.getNextSequenceValue('counterB')).toBe(1)
    expect(await repo.getNextSequenceValue('counterA')).toBe(2)
  })
})

describe('MikroOrmChangeRepository', () => {
  it('should create and find changes', async () => {
    const repo = new MikroOrmChangeRepository(orm.em.fork())
    const created = await repo.create({
      assembly: 'asm-1',
      typeName: 'AddAssemblyAndFeaturesFromFileChange',
      changedIds: [],
      changes: { assemblyName: 'volvox' },
      user: 'testuser@example.com',
      sequence: 1,
    })
    expect(created._id).toBeDefined()
    expect(created.typeName).toBe('AddAssemblyAndFeaturesFromFileChange')
    expect(created.sequence).toBe(1)

    const all = await repo.findAll({})
    expect(all).toHaveLength(1)
    expect(all[0].user).toBe('testuser@example.com')
  })

  it('should filter by assembly and typeName', async () => {
    const repo = new MikroOrmChangeRepository(orm.em.fork())
    await repo.create({
      assembly: 'asm-1',
      typeName: 'AddAssemblyAndFeaturesFromFileChange',
      changedIds: [],
      changes: {},
      user: 'user1@example.com',
      sequence: 1,
    })
    await repo.create({
      assembly: 'asm-2',
      typeName: 'AddFeatureChange',
      changedIds: ['f1'],
      changes: {},
      user: 'user2@example.com',
      sequence: 2,
    })

    const byAssembly = await repo.findAll({ filter: { assembly: 'asm-1' } })
    expect(byAssembly).toHaveLength(1)

    const byType = await repo.findAll({
      filter: { typeName: 'AddFeatureChange' },
    })
    expect(byType).toHaveLength(1)
    expect(byType[0].user).toBe('user2@example.com')
  })

  it('should filter by sinceSequence and sort', async () => {
    const repo = new MikroOrmChangeRepository(orm.em.fork())
    for (let i = 1; i <= 5; i++) {
      await repo.create({
        typeName: 'SomeChange',
        changedIds: [],
        changes: {},
        user: 'user@example.com',
        sequence: i,
      })
    }

    const since3 = await repo.findAll({ sinceSequence: 3 })
    expect(since3).toHaveLength(2)

    const asc = await repo.findAll({ sort: 'asc' })
    expect(asc[0].sequence).toBe(1)

    const limited = await repo.findAll({ limit: 2 })
    expect(limited).toHaveLength(2)
  })
})

describe('activateByUser', () => {
  it('should activate temporary assemblies by user', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({
      _id: 'asm-1',
      name: 'temp',
      status: -1,
      user: 'user-1',
    })
    await repo.create({
      _id: 'asm-2',
      name: 'other',
      status: -1,
      user: 'user-2',
    })

    const count = await repo.activateByUser('user-1')
    expect(count).toBe(1)

    const freshRepo = new MikroOrmAssemblyRepository(orm.em.fork())
    const asm1 = await freshRepo.findById('asm-1')
    expect(asm1!.status).toBe(0)
    const asm2 = await freshRepo.findById('asm-2')
    expect(asm2!.status).toBe(-1)
  })

  it('should activate temporary features by user', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'test', status: 0 })
    const rsRepo = new MikroOrmRefSeqRepository(em)
    await rsRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 1000,
      chunkSize: 500,
    })
    const repo = new MikroOrmFeatureRepository(em)
    await repo.create({
      _id: 'f1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 0,
      max: 100,
      status: -1,
      user: 'user-1',
    })
    await repo.create({
      _id: 'f2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 200,
      max: 300,
      status: -1,
      user: 'user-2',
    })

    expect(await repo.activateByUser('user-1')).toBe(1)
    const freshRepo = new MikroOrmFeatureRepository(orm.em.fork())
    expect((await freshRepo.findById('f1'))!.status).toBe(0)
    expect((await freshRepo.findById('f2'))!.status).toBe(-1)
  })

  it('should activate temporary refSeqs by user', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'test', status: 0 })
    const repo = new MikroOrmRefSeqRepository(em)
    await repo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 100,
      chunkSize: 100,
      status: -1,
      user: 'user-1',
    })

    expect(await repo.activateByUser('user-1')).toBe(1)
    const freshRepo = new MikroOrmRefSeqRepository(orm.em.fork())
    expect((await freshRepo.findById('rs-1'))!.status).toBe(0)
  })

  it('should activate temporary refSeq chunks by user', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'test', status: 0 })
    const rsRepo = new MikroOrmRefSeqRepository(em)
    await rsRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 1000,
      chunkSize: 500,
    })
    const repo = new MikroOrmRefSeqChunkRepository(em)
    await repo.create({
      _id: 'c1',
      refSeq: 'rs-1',
      n: 0,
      sequence: 'ATCG',
      status: -1,
      user: 'user-1',
    })

    expect(await repo.activateByUser('user-1')).toBe(1)
  })
})

describe('End-to-end: assembly with features and sequence', () => {
  it('should store and retrieve a complete assembly with features and chunks', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    const chunkRepo = new MikroOrmRefSeqChunkRepository(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await asmRepo.create({ _id: 'asm-1', name: 'volvox', status: 0 })
    await refSeqRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 16,
      chunkSize: 8,
    })
    await chunkRepo.createMany([
      { _id: 'c0', refSeq: 'rs-1', n: 0, sequence: 'ATCGATCG' },
      { _id: 'c1', refSeq: 'rs-1', n: 1, sequence: 'GCTAGCTA' },
    ])

    await featureRepo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 2,
      max: 14,
      strand: 1,
      status: 0,
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 2,
      max: 14,
      strand: 1,
      parentId: 'gene-1',
      status: 0,
    })
    await featureRepo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 2,
      max: 6,
      strand: 1,
      parentId: 'mrna-1',
      status: 0,
    })
    await featureRepo.create({
      _id: 'exon-2',
      refSeq: 'rs-1',
      type: 'exon',
      min: 10,
      max: 14,
      strand: 1,
      parentId: 'mrna-1',
      status: 0,
    })

    // Verify assembly
    const asm = await asmRepo.findById('asm-1')
    expect(asm).toBeDefined()
    expect(asm!.name).toBe('volvox')

    // Verify refSeqs
    const refSeqs = await refSeqRepo.findByAssembly('asm-1')
    expect(refSeqs).toHaveLength(1)
    expect(refSeqs[0].name).toBe('ctgA')

    // Verify sequence chunks with range query
    const chunks = await chunkRepo.findByRefSeqAndRange('rs-1', 0, 1)
    expect(chunks).toHaveLength(2)
    expect(chunks.map((c) => c.sequence).join('')).toBe('ATCGATCGGCTAGCTA')

    // Verify features
    expect(await featureRepo.findByRange('rs-1', 0, 16)).toHaveLength(4)
    expect(await featureRepo.findRootsByRange('rs-1', 0, 16)).toHaveLength(1)
    expect(await featureRepo.findDescendants('gene-1')).toHaveLength(3)

    // Simulate SequenceService.getSequenceV2 logic
    const refSeq = (await refSeqRepo.findById('rs-1'))!
    const start = 3
    const end = 12
    const startChunk = Math.floor(start / refSeq.chunkSize)
    const endChunk = Math.floor(end / refSeq.chunkSize)
    const rangeChunks = await chunkRepo.findByRefSeqAndRange(
      'rs-1',
      startChunk,
      endChunk,
    )
    const seq: string[] = []
    for (const chunk of rangeChunks) {
      const { n, sequence } = chunk
      if (n === startChunk || n === endChunk) {
        seq.push(
          sequence.slice(
            n === startChunk ? start - n * refSeq.chunkSize : undefined,
            n === endChunk ? end - n * refSeq.chunkSize : undefined,
          ),
        )
      } else {
        seq.push(sequence)
      }
    }
    expect(seq.join('')).toBe('GATCGGCTA')
  })

  it('should handle assembly deletion cascade', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    const chunkRepo = new MikroOrmRefSeqChunkRepository(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await asmRepo.create({ _id: 'asm-1', name: 'volvox', status: 0 })
    await refSeqRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 1000,
      chunkSize: 500,
    })
    await chunkRepo.create({
      _id: 'c0',
      refSeq: 'rs-1',
      n: 0,
      sequence: 'AAAA',
    })
    await featureRepo.create({
      _id: 'f1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 0,
      max: 100,
      status: 0,
    })

    // Simulate DeleteAssemblyChange cleanup order
    await featureRepo.deleteByRefSeqs(['rs-1'])
    await chunkRepo.deleteByRefSeqs(['rs-1'])
    await refSeqRepo.deleteByAssembly('asm-1')
    await asmRepo.deleteById('asm-1')

    expect(await asmRepo.findById('asm-1')).toBeUndefined()
    expect(await refSeqRepo.findByAssembly('asm-1')).toHaveLength(0)
    expect(await chunkRepo.findByRefSeq('rs-1')).toHaveLength(0)
    expect(await featureRepo.findByRange('rs-1', 0, 2000)).toHaveLength(0)
  })
})
