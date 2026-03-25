/**
 * Tests for MongoFeatureRepository.
 *
 * MongoFeatureRepository uses only the generic MikroORM EntityManager API
 * (em.find, em.nativeDelete, etc.) so we can verify its BFS traversal and
 * in-memory text-search logic against SQLite in-memory without needing a
 * real MongoDB instance.
 */
import type { MikroORM } from '@mikro-orm/core'

import { createTestORM } from '../test-utils.js'
import { MikroOrmAssemblyRepository } from './MikroOrmAssemblyRepository.js'
import { MikroOrmRefSeqRepository } from './MikroOrmRefSeqRepository.js'
import { MongoFeatureRepository } from './MongoFeatureRepository.js'

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

describe('MongoFeatureRepository', () => {
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
    })
    await new MikroOrmRefSeqRepository(em).create({
      _id: 'rs-2',
      assembly: 'asm-1',
      name: 'ctgB',
      length: 30000,
    })
  }

  it('should create and find a feature', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    const created = await repo.create({
      _id: 'feat-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      strand: 1,
    })
    expect(created._id).toBe('feat-1')
    expect(created.type).toBe('gene')

    const found = await repo.findById('feat-1')
    expect(found).toBeDefined()
    expect(found!.min).toBe(100)
    expect(found!.max).toBe(500)
    expect(found!.strand).toBe(1)
  })

  it('should return undefined for a missing feature', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    expect(await repo.findById('no-such-id')).toBeUndefined()
  })

  it('findDescendants returns all children and grandchildren', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })
    await repo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
    })
    await repo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 200,
      parentId: 'mrna-1',
    })
    await repo.create({
      _id: 'exon-2',
      refSeq: 'rs-1',
      type: 'exon',
      min: 300,
      max: 500,
      parentId: 'mrna-1',
    })
    // Sibling gene — should NOT appear in descendants of gene-1
    await repo.create({
      _id: 'gene-2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 600,
      max: 900,
    })

    const descendants = await repo.findDescendants('gene-1')
    expect(descendants).toHaveLength(3)
    const ids = descendants.map((r) => r._id)
    expect(ids).toContain('mrna-1')
    expect(ids).toContain('exon-1')
    expect(ids).toContain('exon-2')
    expect(ids).not.toContain('gene-1')
    expect(ids).not.toContain('gene-2')
  })

  it('findDescendants returns empty array for a leaf feature', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })

    expect(await repo.findDescendants('gene-1')).toHaveLength(0)
  })

  it('findDescendantsOfMany returns descendants for multiple roots', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })
    await repo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
    })
    await repo.create({
      _id: 'gene-2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 600,
      max: 900,
    })
    await repo.create({
      _id: 'mrna-2',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 600,
      max: 900,
      parentId: 'gene-2',
    })

    const descendants = await repo.findDescendantsOfMany(['gene-1', 'gene-2'])
    expect(descendants).toHaveLength(2)
    const ids = descendants.map((r) => r._id)
    expect(ids).toContain('mrna-1')
    expect(ids).toContain('mrna-2')
  })

  it('findDescendantsOfMany returns empty for empty input', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    expect(await repo.findDescendantsOfMany([])).toHaveLength(0)
  })

  it('deleteDescendants removes all children without touching the root', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })
    await repo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
    })
    await repo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
    })

    const count = await repo.deleteDescendants('gene-1')
    expect(count).toBeGreaterThanOrEqual(1)

    // Use a fresh fork to bypass the identity map (nativeDelete doesn't invalidate it)
    const freshRepo = new MongoFeatureRepository(orm.em.fork())
    expect(await freshRepo.findById('gene-1')).toBeDefined()
    expect(await freshRepo.findById('mrna-1')).toBeUndefined()
    expect(await freshRepo.findById('exon-1')).toBeUndefined()
  })

  it('deleteDescendants returns 0 for a leaf feature', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })

    expect(await repo.deleteDescendants('gene-1')).toBe(0)
    expect(await repo.findById('gene-1')).toBeDefined()
  })

  it('findRootParent returns the root for a deeply nested feature', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })
    await repo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
    })
    await repo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
    })

    const root = await repo.findRootParent('exon-1')
    expect(root).toBeDefined()
    expect(root!._id).toBe('gene-1')
  })

  it('findRootParent returns the feature itself when it has no parent', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })

    const root = await repo.findRootParent('gene-1')
    expect(root).toBeDefined()
    expect(root!._id).toBe('gene-1')
  })

  it('findRootParentsOfMany resolves roots for multiple features', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })
    await repo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
    })
    await repo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
    })

    await repo.create({
      _id: 'gene-2',
      refSeq: 'rs-1',
      type: 'gene',
      min: 600,
      max: 900,
    })
    await repo.create({
      _id: 'mrna-2',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 600,
      max: 900,
      parentId: 'gene-2',
    })

    // Both exon-1 and mrna-2 resolve to different roots
    const roots = await repo.findRootParentsOfMany(['exon-1', 'mrna-2'])
    expect(roots).toHaveLength(2)
    const ids = roots.map((r) => r._id)
    expect(ids).toContain('gene-1')
    expect(ids).toContain('gene-2')
  })

  it('findRootParentsOfMany returns empty for empty input', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    expect(await repo.findRootParentsOfMany([])).toHaveLength(0)
  })

  it('findRootParentsOfMany deduplicates when features share a root', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })
    await repo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
    })
    await repo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
    })
    await repo.create({
      _id: 'exon-2',
      refSeq: 'rs-1',
      type: 'exon',
      min: 350,
      max: 500,
      parentId: 'mrna-1',
    })

    // exon-1 and exon-2 both resolve to gene-1 — result should be deduplicated
    const roots = await repo.findRootParentsOfMany(['exon-1', 'exon-2'])
    expect(roots).toHaveLength(1)
    expect(roots[0]._id).toBe('gene-1')
  })

  it('searchText returns root features matching type', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })
    await repo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
    })
    await repo.create({
      _id: 'exon-1',
      refSeq: 'rs-1',
      type: 'exon',
      min: 100,
      max: 300,
    })

    expect(await repo.searchText(['rs-1'], 'gene')).toHaveLength(1)
    expect(await repo.searchText(['rs-1'], 'mRNA')).toHaveLength(1)
    expect(await repo.searchText(['rs-1'], 'exon')).toHaveLength(1)
    expect(await repo.searchText(['rs-1'], 'nonexistent')).toHaveLength(0)
  })

  it('searchText finds child attributes and returns root', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      attributes: { Name: ['BRCA1'] },
    })
    await repo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
      attributes: { Name: ['BRCA1-mRNA'] },
    })
    await repo.create({
      _id: 'cds-1',
      refSeq: 'rs-1',
      type: 'CDS',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
      attributes: { Name: ['special-cds'] },
    })

    // Searching child attribute value returns root
    const results = await repo.searchText(['rs-1'], 'special')
    expect(results).toHaveLength(1)
    expect(results[0]._id).toBe('gene-1')
  })

  it('searchText only returns features in the requested refSeqs', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'f1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })
    await repo.create({
      _id: 'f2',
      refSeq: 'rs-2',
      type: 'gene',
      min: 100,
      max: 500,
    })

    expect(await repo.searchText(['rs-1'], 'gene')).toHaveLength(1)
    expect(await repo.searchText(['rs-2'], 'gene')).toHaveLength(1)
    expect(await repo.searchText(['rs-1', 'rs-2'], 'gene')).toHaveLength(2)
  })

  it('searchText returns empty for empty refSeqIds', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })

    expect(await repo.searchText([], 'gene')).toHaveLength(0)
  })

  it('searchText ignores stop words', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
    })

    // "the" is a stop word — tokenize filters it, so query becomes empty → no results
    expect(await repo.searchText(['rs-1'], 'the')).toHaveLength(0)
    expect(await repo.searchText(['rs-1'], 'in')).toHaveLength(0)
  })

  it('findByIndexedId finds features by attribute value and returns root', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      attributes: { ID: ['gene-1-id'] },
    })
    await repo.create({
      _id: 'mrna-1',
      refSeq: 'rs-1',
      type: 'mRNA',
      min: 100,
      max: 500,
      parentId: 'gene-1',
      attributes: { ID: ['mrna-1-id'], Parent: ['gene-1-id'] },
    })
    await repo.create({
      _id: 'cds-1',
      refSeq: 'rs-1',
      type: 'CDS',
      min: 100,
      max: 300,
      parentId: 'mrna-1',
      attributes: { ID: ['cds-1-id'], Parent: ['mrna-1-id'] },
    })

    // Child attribute ID returns root
    const childResult = await repo.findByIndexedId('cds-1-id', ['rs-1'])
    expect(childResult).toHaveLength(1)
    expect(childResult[0]._id).toBe('gene-1')

    // Root ID also returns root
    const rootResult = await repo.findByIndexedId('gene-1-id', ['rs-1'])
    expect(rootResult).toHaveLength(1)
    expect(rootResult[0]._id).toBe('gene-1')
  })

  it('findByIndexedId returns empty for non-existent id', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      attributes: { ID: ['gene-1-id'] },
    })

    expect(await repo.findByIndexedId('nonexistent', ['rs-1'])).toHaveLength(0)
  })

  it('findByIndexedId without refSeqIds searches all features', async () => {
    const em = orm.em.fork()
    await setupRefSeq(em)
    const repo = new MongoFeatureRepository(em)

    await repo.create({
      _id: 'gene-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 500,
      attributes: { ID: ['gene-1-id'] },
    })
    await repo.create({
      _id: 'gene-2',
      refSeq: 'rs-2',
      type: 'gene',
      min: 100,
      max: 500,
      attributes: { ID: ['gene-2-id'] },
    })

    // No refSeqIds → searches all
    const result = await repo.findByIndexedId('gene-2-id')
    expect(result).toHaveLength(1)
    expect(result[0]._id).toBe('gene-2')
  })
})
