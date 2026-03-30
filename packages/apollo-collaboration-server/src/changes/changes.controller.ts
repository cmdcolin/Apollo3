import {
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common'
import {
  FeatureHistoryEntity,
  RefSeqEntity,
} from '@apollo-annotation/entities'
import { EntityManager } from '@mikro-orm/core'

import { Roles } from '../authentication/roles.guard.js'
import { Role } from '../authentication/role.enum.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

interface HistoryRecord {
  _id: string
  sequence: number | null
  changeType: string
  type: string
  changedBy: string | null
  featureId: string
  changedAt: Date
  refSeq: string
  min: number
  max: number
  strand: number | null
  phase: number | null
  attributes: Record<string, string[]> | null
}

interface FieldDiff {
  field: string
  from: unknown
  to: unknown
}

function computeDiffs(before: HistoryRecord, after: { min: number; max: number; strand?: number | null; type: string }) {
  const diffs: FieldDiff[] = []
  if (before.min !== after.min) {
    diffs.push({ field: 'start', from: before.min, to: after.min })
  }
  if (before.max !== after.max) {
    diffs.push({ field: 'end', from: before.max, to: after.max })
  }
  if (before.strand !== (after.strand ?? null)) {
    diffs.push({ field: 'strand', from: before.strand, to: after.strand })
  }
  if (before.type !== after.type) {
    diffs.push({ field: 'type', from: before.type, to: after.type })
  }
  return diffs
}

@Controller('changes')
export class ChangesController {
  constructor(
    @Inject(EntityManager) private readonly em: EntityManager,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  // Recent changes across all assemblies, grouped by sequence (operation).
  // Each row represents one user action that may have touched multiple features.
  @Roles(Role.ReadOnly)
  @Get('recent')
  async getRecentChanges(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ) {
    const take = limit ?? 25
    const skip = ((page ?? 1) - 1) * take

    const fork = this.em.fork()

    // Fetch enough raw rows to fill the page after grouping. Most operations
    // touch 1-5 features, so 10x is a generous buffer.
    const rows = await fork.find(
      FeatureHistoryEntity,
      {},
      { orderBy: { changedAt: 'DESC' }, limit: take * 10 },
    )

    // Group by sequence number
    const grouped = new Map<number | string, HistoryRecord[]>()
    let nullCounter = 0
    for (const row of rows) {
      const key = row.sequence ?? `null-${nullCounter++}`
      const existing = grouped.get(key)
      if (existing) {
        existing.push(row)
      } else {
        grouped.set(key, [row])
      }
    }

    // Collect unique refSeq IDs to resolve assembly names
    const refSeqIds = new Set<string>()
    for (const row of rows) {
      refSeqIds.add(row.refSeq)
    }
    const refSeqToAssembly = await this.resolveAssemblyNames([...refSeqIds])

    // Paginate the groups
    const allGroups = [...grouped.values()]
    const pageGroups = allGroups.slice(skip, skip + take)

    const changes = pageGroups.map((group) => {
      const first = group[0]
      const changeTypes = [...new Set(group.map((r) => r.changeType))]
      const featureTypes = [...new Set(group.map((r) => r.type))]
      const featureIds = [...new Set(group.map((r) => r.featureId))]
      const assembly = refSeqToAssembly.get(first.refSeq)

      return {
        _id: first._id,
        sequence: first.sequence,
        user: first.changedBy ?? 'unknown',
        createdAt: first.changedAt.toISOString(),
        assembly: assembly ?? undefined,
        changeTypes,
        featureTypes,
        featureIds,
        featureCount: featureIds.length,
        summary: `${changeTypes.join('/')} ${featureIds.length} feature${featureIds.length > 1 ? 's' : ''} (${featureTypes.join(', ')})`,
      }
    })

    // Exact count when all rows fit in buffer; otherwise estimate using
    // average group size from the sample we fetched.
    const totalRows = await fork.count(FeatureHistoryEntity, {})
    const avgGroupSize = rows.length > 0 ? rows.length / allGroups.length : 1
    const total = rows.length >= totalRows
      ? allGroups.length
      : Math.ceil(totalRows / avgGroupSize)

    return { changes, total, page: page ?? 1, limit: take }
  }

  // History for a specific gene and all its subfeatures, with before/after
  // diffs on update records showing what field values changed.
  @Roles(Role.ReadOnly)
  @Get('gene/:featureId')
  async getGeneHistory(
    @Param('featureId') featureId: string,
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ) {
    const take = limit ?? 25
    const skip = ((page ?? 1) - 1) * take

    const descendants = await this.db.feature.findDescendants(featureId)
    const featureIds = [featureId, ...descendants.map((d) => d._id)]

    const fork = this.em.fork()
    const where = { featureId: { $in: featureIds } }

    // Fetch all history for this gene tree (for diff computation) plus counts
    const [allRecords, total] = await Promise.all([
      fork.find(FeatureHistoryEntity, where, {
        orderBy: { changedAt: 'ASC' },
      }),
      fork.count(FeatureHistoryEntity, where),
    ])

    // Build per-feature record chains so we can compute diffs.
    // For an update record at index i, the "after" state is the pre-change
    // state of record i+1 (or the current feature if it's the last update).
    const byFeature = new Map<string, HistoryRecord[]>()
    for (const record of allRecords) {
      const existing = byFeature.get(record.featureId)
      if (existing) {
        existing.push(record)
      } else {
        byFeature.set(record.featureId, [record])
      }
    }

    // Look up current feature state for computing diffs on the most recent update
    const currentFeatures = await this.db.feature.findByIds(featureIds)
    const currentById = new Map(currentFeatures.map((f) => [f._id, f]))

    // Build the response with diffs, in reverse chronological order
    const allWithDiffs = [...allRecords].reverse().map((record) => {
      const result: {
        _id: string
        sequence: number | null
        featureId: string
        featureType: string
        changeType: string
        user: string
        createdAt: string
        diffs?: FieldDiff[]
      } = {
        _id: record._id,
        sequence: record.sequence,
        featureId: record.featureId,
        featureType: record.type,
        changeType: record.changeType,
        user: record.changedBy ?? 'unknown',
        createdAt: record.changedAt.toISOString(),
      }

      if (record.changeType === 'update') {
        const chain = byFeature.get(record.featureId) ?? []
        const idx = chain.indexOf(record)
        if (idx < chain.length - 1) {
          // Next record's pre-change state = this record's post-change state
          result.diffs = computeDiffs(record, chain[idx + 1])
        } else {
          // Last record: compare against current feature state
          const current = currentById.get(record.featureId)
          if (current) {
            result.diffs = computeDiffs(record, current)
          }
        }
      }

      return result
    })

    const paged = allWithDiffs.slice(skip, skip + take)

    return { changes: paged, total, page: page ?? 1, limit: take }
  }

  private async resolveAssemblyNames(refSeqIds: string[]) {
    const result = new Map<string, string>()
    if (refSeqIds.length === 0) {
      return result
    }

    // Single query: fetch refSeqs with their assembly relation populated
    const refSeqs = await this.em.fork().find(
      RefSeqEntity,
      { _id: { $in: refSeqIds } },
      { populate: ['assembly'] },
    )

    for (const rs of refSeqs) {
      const asm = rs.assembly
      if (typeof asm === 'object' && asm.name) {
        result.set(rs._id, asm.name)
      }
    }

    return result
  }
}
