import type { MikroORM } from '@mikro-orm/core'
import {
  MikroOrmAssemblyRepository,
  MikroOrmFeatureRepository,
  createTestORM,
} from '@apollo-annotation/entities'
import type { DecodedJWT } from '@apollo-annotation/shared'

import { DatabaseService } from '../mikro-orm/database.service.js'
import { FeaturesService } from './features.service.js'
import type { ChecksService } from '../checks/checks.service.js'
import type { MessagesGateway } from '../messages/messages.gateway.js'

let orm: MikroORM

const mockUser: DecodedJWT = {
  email: 'test@example.com',
  username: 'testuser',
  role: 'admin',
  id: 'user-1',
  iat: 0,
  exp: 9_999_999_999,
}

const mockChecksService = {
  checkFeature: async () => [],
} as unknown as ChecksService

const mockMessagesGateway = {
  emitToAssembly: () => {},
} as unknown as MessagesGateway

async function setupFixture() {
  const em = orm.em.fork()
  const assemblyRepo = new MikroOrmAssemblyRepository(em)
  await assemblyRepo.create({ _id: 'asm-1', name: 'test-assembly' })
}

function makeService() {
  const em = orm.em.fork()
  const db = new DatabaseService(em)
  return new FeaturesService(mockChecksService, db, mockMessagesGateway, em)
}

beforeAll(async () => {
  orm = await createTestORM()
})

afterAll(async () => {
  await orm.close(true)
})

beforeEach(async () => {
  await orm.schema.refresh()
  await setupFixture()
})

describe('FeaturesService.addFeature', () => {
  it('expands parent bounds when new child extends beyond them', async () => {
    const service = makeService()
    const featureRepo = new MikroOrmFeatureRepository(orm.em.fork())

    // Create parent gene with narrow bounds
    await featureRepo.create({
      _id: 'gene-1',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 400,
    })

    // Add a child exon whose max exceeds the parent's current max
    await service.addFeature(
      {
        addedFeature: {
          _id: 'exon-1',
          refSeq: 'chr1',
          type: 'exon',
          min: 300,
          max: 600,
        },
        parentFeatureId: 'gene-1',
        assemblyId: 'asm-1',
      },
      mockUser,
    )

    const gene = await new MikroOrmFeatureRepository(
      orm.em.fork(),
    ).findById('gene-1')
    expect(gene!.max).toBe(600)
  })

  it('does not expand parent bounds when new child is inside existing children', async () => {
    const service = makeService()
    const featureRepo = new MikroOrmFeatureRepository(orm.em.fork())

    // Gene already has an outer exon defining its bounds
    await featureRepo.create({
      _id: 'gene-1',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 400,
    })
    await featureRepo.create({
      _id: 'exon-outer',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      parentId: 'gene-1',
      type: 'exon',
      min: 100,
      max: 400,
    })

    // Add a second exon whose bounds are fully inside the first
    await service.addFeature(
      {
        addedFeature: {
          _id: 'exon-inner',
          refSeq: 'chr1',
          type: 'exon',
          min: 150,
          max: 300,
        },
        parentFeatureId: 'gene-1',
        assemblyId: 'asm-1',
      },
      mockUser,
    )

    // Gene bounds should be unchanged — outer exon still defines the extent
    const gene = await new MikroOrmFeatureRepository(
      orm.em.fork(),
    ).findById('gene-1')
    expect(gene!.min).toBe(100)
    expect(gene!.max).toBe(400)
  })
})

describe('FeaturesService.undoChange', () => {
  it('restores parent bounds after undoing a child delete', async () => {
    const service = makeService()
    const featureRepo = new MikroOrmFeatureRepository(orm.em.fork())

    // Gene with two exons defining its full extent
    await featureRepo.create({
      _id: 'gene-1',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 600,
    })
    await featureRepo.create({
      _id: 'exon-1',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      parentId: 'gene-1',
      type: 'exon',
      min: 100,
      max: 300,
    })
    await featureRepo.create({
      _id: 'exon-2',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      parentId: 'gene-1',
      type: 'exon',
      min: 300,
      max: 600,
    })

    // Delete exon-2 — gene bounds should shrink since only exon-1 remains
    const deleteResult = await service.deleteFeature('exon-2', mockUser)
    const geneAfterDelete = await new MikroOrmFeatureRepository(
      orm.em.fork(),
    ).findById('gene-1')
    expect(geneAfterDelete!.max).toBe(300)

    // Undo the delete — exon-2 is restored, gene bounds should recover
    await service.undoChange(deleteResult.changeSequence, mockUser)

    const geneAfterUndo = await new MikroOrmFeatureRepository(
      orm.em.fork(),
    ).findById('gene-1')
    expect(geneAfterUndo!.max).toBe(600)
  })
})

describe('FeaturesService.mergeTranscripts', () => {
  it('correctly merges three overlapping exons across transcripts', async () => {
    const service = makeService()
    const featureRepo = new MikroOrmFeatureRepository(orm.em.fork())

    // Build: gene → transcript1 [exon1(100-200), exon2(350-450)]
    //              transcript2 [exon3(150-400)] overlaps both
    await featureRepo.create({
      _id: 'gene-1',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      type: 'gene',
      min: 100,
      max: 450,
    })
    await featureRepo.create({
      _id: 'tx1',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      parentId: 'gene-1',
      type: 'mRNA',
      min: 100,
      max: 450,
    })
    await featureRepo.create({
      _id: 'exon1',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      parentId: 'tx1',
      type: 'exon',
      min: 100,
      max: 200,
    })
    await featureRepo.create({
      _id: 'exon2',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      parentId: 'tx1',
      type: 'exon',
      min: 350,
      max: 450,
    })
    await featureRepo.create({
      _id: 'tx2',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      parentId: 'gene-1',
      type: 'mRNA',
      min: 150,
      max: 400,
    })
    await featureRepo.create({
      _id: 'exon3',
      assembly: 'asm-1',
      refSeq: 'rs-1',
      parentId: 'tx2',
      type: 'exon',
      min: 150,
      max: 400,
    })

    await service.mergeTranscripts(
      { firstTranscriptId: 'tx1', secondTranscriptId: 'tx2' },
      mockUser,
    )

    // exon1(100-200) and exon3(150-400) overlap → merged to (100-400)
    // exon2(350-450) also overlaps exon3 → should be merged into (100-450)
    const remaining = await new MikroOrmFeatureRepository(
      orm.em.fork(),
    ).findChildren('tx1')
    expect(remaining).toHaveLength(1)
    expect(remaining[0].min).toBe(100)
    expect(remaining[0].max).toBe(450)
  })
})
