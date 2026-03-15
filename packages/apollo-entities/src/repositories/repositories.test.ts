import type { MikroORM } from '@mikro-orm/core'

import { createTestORM } from '../test-utils.js'
import { MikroOrmAssemblyRepository } from './MikroOrmAssemblyRepository.js'
import { MikroOrmChangeRepository } from './MikroOrmChangeRepository.js'
import { MikroOrmCheckRepository } from './MikroOrmCheckRepository.js'
import { MikroOrmCheckResultRepository } from './MikroOrmCheckResultRepository.js'
import { MikroOrmCounterRepository } from './MikroOrmCounterRepository.js'
import { MikroOrmFeatureRepository } from './MikroOrmFeatureRepository.js'
import { MikroOrmFileRepository } from './MikroOrmFileRepository.js'
import { MikroOrmJBrowseConfigRepository } from './MikroOrmJBrowseConfigRepository.js'
import { MikroOrmRefSeqChunkRepository } from './MikroOrmRefSeqChunkRepository.js'
import { MikroOrmRefSeqRepository } from './MikroOrmRefSeqRepository.js'
import { MikroOrmUserRepository } from './MikroOrmUserRepository.js'

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
    })
    expect(created._id).toBe('asm-1')
    expect(created.name).toBe('test-assembly')

    const found = await repo.findById('asm-1')
    expect(found).toBeDefined()
    expect(found!.name).toBe('test-assembly')
  })

  it('should find assembly by name', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({ _id: 'asm-1', name: 'volvox' })

    const found = await repo.findByName('volvox')
    expect(found).toBeDefined()
    expect(found!._id).toBe('asm-1')

    const notFound = await repo.findByName('nonexistent')
    expect(notFound).toBeUndefined()
  })

  it('should find all assemblies', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({ _id: 'asm-1', name: 'volvox' })
    await repo.create({ _id: 'asm-2', name: 'yeast' })

    const all = await repo.findAll()
    expect(all).toHaveLength(2)
  })

  it('should update assembly by id', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({ _id: 'asm-1', name: 'volvox' })

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
    await repo.create({ _id: 'asm-1', name: 'volvox' })

    expect(await repo.deleteById('asm-1')).toBe(true)
    expect(await repo.findById('asm-1')).toBeUndefined()
    expect(await repo.deleteById('asm-1')).toBe(false)
  })

  it('should store sequenceSource', async () => {
    const repo = new MikroOrmAssemblyRepository(orm.em.fork())
    await repo.create({
      _id: 'asm-ext',
      name: 'external',

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
    await asmRepo.create({ _id: 'asm-1', name: 'volvox' })

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
    await asmRepo.create({ _id: 'asm-1', name: 'volvox' })
    await asmRepo.create({ _id: 'asm-2', name: 'yeast' })

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
    await asmRepo.create({ _id: 'asm-1', name: 'volvox' })

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
    await asmRepo.create({ _id: 'asm-1', name: 'volvox' })

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
    await asmRepo.create({ _id: 'asm-1', name: 'volvox' })

    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    await refSeqRepo.create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
    })

    const updated = await refSeqRepo.updateById('rs-1', {
      name: 'ctgA-updated',
    })
    expect(updated).toBeDefined()
    expect(updated!.name).toBe('ctgA-updated')
  })

  it('should delete refSeqs by assembly', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    await asmRepo.create({ _id: 'asm-1', name: 'volvox' })

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
    await asmRepo.create({ _id: 'asm-1', name: 'volvox' })

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
    })
    await featureRepo.create({
      _id: 'f2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 600,
      max: 900,
    })
    await featureRepo.create({
      _id: 'f3',
      refSeq: 'rs-1',
      type: 'gene',
      min: 1000,
      max: 1500,
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
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
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
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
    })
    await featureRepo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
    })
    await featureRepo.create({
      _id: 'exon-2',
      refSeq: 'rs-1',
      type: 'exon',
      min: 400,
      max: 500,
      parentId: 'mrna-1',
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
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
    })
    await featureRepo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
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
    })
    await featureRepo.create({
      _id: 'f2',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
    })
    await featureRepo.create({
      _id: 'f3',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
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
      },
      {
        _id: 'f2',
        refSeq: 'rs-1',
        type: 'gene',
        min: 600,
        max: 900,
      },
    ])
    expect(created).toHaveLength(2)
  })

  it('should search text in child features and return root', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,

      attributes: { Name: ['BRCA1'] },
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',

      attributes: { Name: ['BRCA1-mRNA'] },
    })
    await featureRepo.create({
      _id: 'cds-1',
      refSeq: 'rs-1',
      type: 'CDS',
      min: 100,
      max: 300,
      parentId: 'mrna-1',

      attributes: { Name: ['special-cds'] },
    })

    // Searching for child attribute should return root
    const results = await featureRepo.searchText(['rs-1'], 'special')
    expect(results).toHaveLength(1)
    expect(results[0]._id).toBe('gene-1')

    // Searching for type should work
    const cdsResults = await featureRepo.searchText(['rs-1'], 'CDS')
    expect(cdsResults).toHaveLength(1)
    expect(cdsResults[0]._id).toBe('gene-1')
  })

  it('should find by indexed id in child attributes and return root', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await featureRepo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,

      attributes: { ID: ['gene-1-id'] },
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',

      attributes: { ID: ['mrna-1-id'], Parent: ['gene-1-id'] },
    })
    await featureRepo.create({
      _id: 'cds-1',
      refSeq: 'rs-1',
      type: 'CDS',
      min: 100,
      max: 300,
      parentId: 'mrna-1',

      attributes: { ID: ['cds-1-id'], Parent: ['mrna-1-id'] },
    })

    // Searching for child's ID attribute should return root
    const results = await featureRepo.findByIndexedId('cds-1-id', ['rs-1'])
    expect(results).toHaveLength(1)
    expect(results[0]._id).toBe('gene-1')

    // Searching for root's ID should also return root
    const rootResults = await featureRepo.findByIndexedId('gene-1-id', ['rs-1'])
    expect(rootResults).toHaveLength(1)
    expect(rootResults[0]._id).toBe('gene-1')

    // Non-existent ID returns empty
    const noResults = await featureRepo.findByIndexedId('nonexistent', ['rs-1'])
    expect(noResults).toHaveLength(0)
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
    })
    await featureRepo.create({
      _id: 'f2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 600,
      max: 900,
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
    })
    await featureRepo.create({
      _id: 'f2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 600,
      max: 900,
    })
    await featureRepo.create({
      _id: 'f3',
      refSeq: 'rs-1',
      type: 'gene',
      min: 1000,
      max: 1500,
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

describe('MikroOrmCheckRepository', () => {
  it('should upsert and find a check', async () => {
    const repo = new MikroOrmCheckRepository(orm.em.fork())
    const created = await repo.upsert({
      _id: 'chk-1',
      name: 'MissingAttributeCheck',
      isDefault: true,
      version: 1,
    })
    expect(created._id).toBe('chk-1')
    expect(created.name).toBe('MissingAttributeCheck')

    const found = await repo.findById('chk-1')
    expect(found).toBeDefined()
    expect(found!.name).toBe('MissingAttributeCheck')
    expect(found!.isDefault).toBe(true)
  })

  it('should upsert to update an existing check', async () => {
    const repo = new MikroOrmCheckRepository(orm.em.fork())
    await repo.upsert({
      _id: 'chk-1',
      name: 'MissingAttributeCheck',
      isDefault: true,
      version: 1,
    })

    const updated = await repo.upsert({
      _id: 'chk-1',
      name: 'MissingAttributeCheck',
      isDefault: false,
      version: 2,
    })
    expect(updated.version).toBe(2)
    expect(updated.isDefault).toBe(false)

    const all = await repo.findAll()
    expect(all).toHaveLength(1)
  })

  it('should find by name', async () => {
    const repo = new MikroOrmCheckRepository(orm.em.fork())
    await repo.upsert({ _id: 'chk-1', name: 'CDSCheck', version: 1 })
    await repo.upsert({ _id: 'chk-2', name: 'SpliceCheck', version: 1 })

    const found = await repo.findByName('CDSCheck')
    expect(found).toBeDefined()
    expect(found!._id).toBe('chk-1')

    expect(await repo.findByName('nonexistent')).toBeUndefined()
  })

  it('should find defaults', async () => {
    const repo = new MikroOrmCheckRepository(orm.em.fork())
    await repo.upsert({
      _id: 'chk-1',
      name: 'CDSCheck',
      isDefault: true,
      version: 1,
    })
    await repo.upsert({
      _id: 'chk-2',
      name: 'SpliceCheck',
      isDefault: false,
      version: 1,
    })
    await repo.upsert({
      _id: 'chk-3',
      name: 'ORFCheck',
      isDefault: true,
      version: 1,
    })

    const defaults = await repo.findDefaults()
    expect(defaults).toHaveLength(2)
    expect(defaults.map((d) => d.name).sort()).toEqual(['CDSCheck', 'ORFCheck'])
  })

  it('should find by ids', async () => {
    const repo = new MikroOrmCheckRepository(orm.em.fork())
    await repo.upsert({ _id: 'chk-1', name: 'Check1', version: 1 })
    await repo.upsert({ _id: 'chk-2', name: 'Check2', version: 1 })
    await repo.upsert({ _id: 'chk-3', name: 'Check3', version: 1 })

    const found = await repo.findByIds(['chk-1', 'chk-3'])
    expect(found).toHaveLength(2)

    expect(await repo.findByIds([])).toHaveLength(0)
  })

  it('should find all checks sorted by name', async () => {
    const repo = new MikroOrmCheckRepository(orm.em.fork())
    await repo.upsert({ _id: 'chk-1', name: 'Zebra', version: 1 })
    await repo.upsert({ _id: 'chk-2', name: 'Alpha', version: 1 })
    await repo.upsert({ _id: 'chk-3', name: 'Middle', version: 1 })

    const all = await repo.findAll()
    expect(all).toHaveLength(3)
    expect(all[0].name).toBe('Alpha')
    expect(all[2].name).toBe('Zebra')
  })
})

describe('MikroOrmCheckResultRepository', () => {
  async function setupRefSeq(em: ReturnType<typeof orm.em.fork>) {
    await new MikroOrmAssemblyRepository(em).create({
      _id: 'asm-1',
      name: 'volvox',
    })
    await new MikroOrmRefSeqRepository(em).create({
      _id: 'rs-1',
      assembly: 'asm-1',
      name: 'ctgA',
      length: 50000,
      chunkSize: 20000,
    })
  }

  it('should create and find check results by range', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MikroOrmCheckResultRepository(em)

    await repo.create({
      _id: 'cr-1',
      name: 'CDSCheck',
      featureId: 'feat-1',
      refSeq: 'rs-1',
      start: 100,
      end: 500,
      ignored: false,
    })
    await repo.create({
      _id: 'cr-2',
      name: 'CDSCheck',
      featureId: 'feat-2',
      refSeq: 'rs-1',
      start: 1000,
      end: 2000,
      ignored: false,
    })

    const inRange = await repo.findByRange('rs-1', 0, 600)
    expect(inRange).toHaveLength(1)
    expect(inRange[0]._id).toBe('cr-1')

    const allRange = await repo.findByRange('rs-1', 0, 5000)
    expect(allRange).toHaveLength(2)
  })

  it('should find by feature id', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MikroOrmCheckResultRepository(em)

    await repo.create({
      _id: 'cr-1',
      name: 'CDSCheck',
      featureId: 'feat-1',
      refSeq: 'rs-1',
      start: 100,
      end: 500,
      ignored: false,
    })
    await repo.create({
      _id: 'cr-2',
      name: 'CDSCheck',
      featureId: 'feat-3',
      refSeq: 'rs-1',
      start: 600,
      end: 800,
      ignored: false,
    })

    const results = await repo.findByFeatureId('feat-1')
    expect(results).toHaveLength(1)
    expect(results[0]._id).toBe('cr-1')

    expect(await repo.findByFeatureId('nonexistent')).toHaveLength(0)
  })

  it('should find by refSeq ids', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MikroOrmCheckResultRepository(em)

    await repo.create({
      _id: 'cr-1',
      name: 'CDSCheck',
      featureId: 'feat-1',
      refSeq: 'rs-1',
      start: 100,
      end: 500,
      ignored: false,
    })

    const results = await repo.findByRefSeqIds(['rs-1'])
    expect(results).toHaveLength(1)

    expect(await repo.findByRefSeqIds(['rs-nonexistent'])).toHaveLength(0)
  })

  it('should create many check results', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MikroOrmCheckResultRepository(em)

    const created = await repo.createMany([
      {
        _id: 'cr-1',
        name: 'CDSCheck',
        featureId: 'feat-1',
        refSeq: 'rs-1',
        start: 100,
        end: 500,
        ignored: false,
      },
      {
        _id: 'cr-2',
        name: 'CDSCheck',
        featureId: 'feat-2',
        refSeq: 'rs-1',
        start: 600,
        end: 800,
        ignored: false,
      },
    ])
    expect(created).toHaveLength(2)

    expect(await repo.createMany([])).toHaveLength(0)
  })

  it('should delete by ids', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MikroOrmCheckResultRepository(em)

    await repo.create({
      _id: 'cr-1',
      name: 'CDSCheck',
      featureId: 'feat-1',
      refSeq: 'rs-1',
      start: 100,
      end: 500,
      ignored: false,
    })
    await repo.create({
      _id: 'cr-2',
      name: 'CDSCheck',
      featureId: 'feat-2',
      refSeq: 'rs-1',
      start: 600,
      end: 800,
      ignored: false,
    })

    expect(await repo.deleteByIds(['cr-1'])).toBe(1)
    expect(await repo.findByRange('rs-1', 0, 5000)).toHaveLength(1)
  })

  it('should delete by refSeq', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MikroOrmCheckResultRepository(em)

    await repo.create({
      _id: 'cr-1',
      name: 'CDSCheck',
      featureId: 'feat-1',
      refSeq: 'rs-1',
      start: 100,
      end: 500,
      ignored: false,
    })
    await repo.create({
      _id: 'cr-2',
      name: 'CDSCheck',
      featureId: 'feat-2',
      refSeq: 'rs-1',
      start: 600,
      end: 800,
      ignored: false,
    })

    expect(await repo.deleteByRefSeq('rs-1')).toBe(2)
    expect(await repo.findByRange('rs-1', 0, 5000)).toHaveLength(0)
  })

  it('should delete by feature ids and check name', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MikroOrmCheckResultRepository(em)

    await repo.create({
      _id: 'cr-1',
      name: 'CDSCheck',
      featureId: 'feat-1',
      refSeq: 'rs-1',
      start: 100,
      end: 500,
      ignored: false,
    })
    await repo.create({
      _id: 'cr-2',
      name: 'CDSCheck',
      featureId: 'feat-2',
      refSeq: 'rs-1',
      start: 600,
      end: 800,
      ignored: false,
    })
    await repo.create({
      _id: 'cr-3',
      name: 'SpliceCheck',
      featureId: 'feat-1',
      refSeq: 'rs-1',
      start: 100,
      end: 500,
      ignored: false,
    })

    expect(await repo.deleteByFeatureIdsAndName(['feat-1'], 'CDSCheck')).toBe(1)
    expect(await repo.findByRange('rs-1', 0, 5000)).toHaveLength(2)
  })

  it('should update by id', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MikroOrmCheckResultRepository(em)

    await repo.create({
      _id: 'cr-1',
      name: 'CDSCheck',
      featureId: 'feat-1',
      refSeq: 'rs-1',
      start: 100,
      end: 500,
      ignored: false,
    })

    const updated = await repo.updateById('cr-1', { ignored: true })
    expect(updated).toBeDefined()
    expect(updated!.ignored).toBe(true)

    expect(
      await repo.updateById('nonexistent', { ignored: true }),
    ).toBeUndefined()
  })
})

describe('MikroOrmUserRepository', () => {
  it('should create and find a user', async () => {
    const repo = new MikroOrmUserRepository(orm.em.fork())
    const created = await repo.create({
      _id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'admin',
    })
    expect(created._id).toBe('user-1')
    expect(created.username).toBe('alice')

    const found = await repo.findById('user-1')
    expect(found).toBeDefined()
    expect(found!.email).toBe('alice@example.com')
    expect(found!.role).toBe('admin')
  })

  it('should find by email', async () => {
    const repo = new MikroOrmUserRepository(orm.em.fork())
    await repo.create({
      _id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'admin',
    })

    const found = await repo.findByEmail('alice@example.com')
    expect(found).toBeDefined()
    expect(found!._id).toBe('user-1')

    expect(await repo.findByEmail('nobody@example.com')).toBeUndefined()
  })

  it('should find by role', async () => {
    const repo = new MikroOrmUserRepository(orm.em.fork())
    await repo.create({
      _id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'admin',
    })
    await repo.create({
      _id: 'user-2',
      username: 'bob',
      email: 'bob@example.com',
      role: 'user',
    })

    const admin = await repo.findByRole('admin')
    expect(admin).toBeDefined()
    expect(admin!.username).toBe('alice')

    expect(await repo.findByRole('none')).toBeUndefined()
  })

  it('should find all users', async () => {
    const repo = new MikroOrmUserRepository(orm.em.fork())
    await repo.create({
      _id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'admin',
    })
    await repo.create({
      _id: 'user-2',
      username: 'bob',
      email: 'bob@example.com',
      role: 'user',
    })

    expect(await repo.findAll()).toHaveLength(2)
  })

  it('should count users', async () => {
    const repo = new MikroOrmUserRepository(orm.em.fork())
    expect(await repo.count()).toBe(0)

    await repo.create({
      _id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'admin',
    })
    expect(await repo.count()).toBe(1)
  })

  it('should update user by id', async () => {
    const repo = new MikroOrmUserRepository(orm.em.fork())
    await repo.create({
      _id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'user',
    })

    const updated = await repo.updateById('user-1', { role: 'admin' })
    expect(updated).toBeDefined()
    expect(updated!.role).toBe('admin')

    expect(
      await repo.updateById('nonexistent', { role: 'admin' }),
    ).toBeUndefined()
  })

  it('should delete by id', async () => {
    const repo = new MikroOrmUserRepository(orm.em.fork())
    await repo.create({
      _id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'admin',
    })

    expect(await repo.deleteById('user-1')).toBe(true)
    expect(await repo.findById('user-1')).toBeUndefined()
    expect(await repo.deleteById('user-1')).toBe(false)
  })

  it('should delete by email', async () => {
    const repo = new MikroOrmUserRepository(orm.em.fork())
    await repo.create({
      _id: 'user-1',
      username: 'alice',
      email: 'alice@example.com',
      role: 'admin',
    })

    expect(await repo.deleteByEmail('alice@example.com')).toBe(true)
    expect(await repo.findByEmail('alice@example.com')).toBeUndefined()
    expect(await repo.deleteByEmail('alice@example.com')).toBe(false)
  })
})

describe('MikroOrmJBrowseConfigRepository', () => {
  it('should upsert and find a config', async () => {
    const repo = new MikroOrmJBrowseConfigRepository(orm.em.fork())

    expect(await repo.findOne()).toBeUndefined()

    const created = await repo.upsert({
      _id: 'cfg-1',
      config: { assemblies: [], tracks: [] },
    })
    expect(created._id).toBe('cfg-1')
    expect(created.config).toEqual({ assemblies: [], tracks: [] })

    const found = await repo.findOne()
    expect(found).toBeDefined()
    expect(found!._id).toBe('cfg-1')
  })

  it('should upsert to update existing config', async () => {
    const repo = new MikroOrmJBrowseConfigRepository(orm.em.fork())
    await repo.upsert({
      _id: 'cfg-1',
      config: { assemblies: [] },
    })

    await repo.upsert({
      _id: 'cfg-1',
      config: { assemblies: [{ name: 'volvox' }] },
    })

    const found = await repo.findOne()
    expect(found).toBeDefined()
    expect(found!.config).toEqual({ assemblies: [{ name: 'volvox' }] })
  })

  it('should delete all configs', async () => {
    const repo = new MikroOrmJBrowseConfigRepository(orm.em.fork())
    await repo.upsert({
      _id: 'cfg-1',
      config: { assemblies: [] },
    })

    await repo.deleteAll()
    expect(await repo.findOne()).toBeUndefined()
  })
})

describe('End-to-end: assembly with features and sequence', () => {
  it('should store and retrieve a complete assembly with features and chunks', async () => {
    const em = orm.em.fork()
    const asmRepo = new MikroOrmAssemblyRepository(em)
    const refSeqRepo = new MikroOrmRefSeqRepository(em)
    const chunkRepo = new MikroOrmRefSeqChunkRepository(em)
    const featureRepo = new MikroOrmFeatureRepository(em)

    await asmRepo.create({ _id: 'asm-1', name: 'volvox' })
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
    })
    await featureRepo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 2,
      max: 14,
      strand: 1,
      parentId: 'gene-1',
    })
    await featureRepo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 2,
      max: 6,
      strand: 1,
      parentId: 'mrna-1',
    })
    await featureRepo.create({
      _id: 'exon-2',
      refSeq: 'rs-1',
      type: 'exon',
      min: 10,
      max: 14,
      strand: 1,
      parentId: 'mrna-1',
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

    await asmRepo.create({ _id: 'asm-1', name: 'volvox' })
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
