import { Controller, Get, Inject, Param } from '@nestjs/common'
import {
  FeatureHistoryEntity,
  RefSeqEntity,
} from '@apollo-annotation/entities'
import { EntityManager } from '@mikro-orm/core'

import { Roles } from '../authentication/roles.guard.js'
import { Role } from '../authentication/role.enum.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

@Controller('changes')
export class ChangesController {
  constructor(
    @Inject(EntityManager) private readonly em: EntityManager,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  // Recent changes across all assemblies, grouped by sequence (operation).
  // Returns up to 1000 most recent raw history rows, grouped into operations.
  @Roles(Role.ReadOnly)
  @Get('recent')
  async getRecentChanges() {
    const fork = this.em.fork()
    const rows = await fork.find(
      FeatureHistoryEntity,
      {},
      { orderBy: { changedAt: 'DESC' }, limit: 1000 },
    )

    // Resolve assembly names for all refSeqs in one query
    const refSeqIds = [...new Set(rows.map((r) => r.refSeq))]
    const refSeqToAssembly = await this.resolveAssemblyNames(refSeqIds)

    // Group by sequence number
    const grouped = new Map<number | string, (typeof rows)[number][]>()
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

    const changes = [...grouped.values()].map((group) => {
      const first = group[0]
      const changeTypes = [...new Set(group.map((r) => r.changeType))]
      const featureTypes = [...new Set(group.map((r) => r.type))]
      const featureIds = [...new Set(group.map((r) => r.featureId))]

      return {
        _id: first._id,
        sequence: first.sequence,
        user: first.changedBy ?? 'unknown',
        createdAt: first.changedAt.toISOString(),
        assembly: refSeqToAssembly.get(first.refSeq),
        changeTypes,
        featureTypes,
        featureIds,
        featureCount: featureIds.length,
        summary: `${changeTypes.join('/')} ${featureIds.length} feature${featureIds.length > 1 ? 's' : ''} (${featureTypes.join(', ')})`,
      }
    })

    return { changes }
  }

  // All history for a specific gene and its subfeatures.
  @Roles(Role.ReadOnly)
  @Get('gene/:featureId')
  async getGeneHistory(
    @Param('featureId') featureId: string,
  ) {
    const descendants = await this.db.feature.findDescendants(featureId)
    const featureIds = [featureId, ...descendants.map((d) => d._id)]

    const records = await this.em.fork().find(
      FeatureHistoryEntity,
      { featureId: { $in: featureIds } },
      { orderBy: { changedAt: 'DESC' } },
    )

    const changes = records.map((r) => ({
      _id: r._id,
      sequence: r.sequence,
      featureId: r.featureId,
      featureType: r.type,
      changeType: r.changeType,
      user: r.changedBy ?? 'unknown',
      createdAt: r.changedAt.toISOString(),
      min: r.min,
      max: r.max,
      strand: r.strand,
      attributes: r.attributes,
    }))

    return { changes }
  }

  private async resolveAssemblyNames(refSeqIds: string[]) {
    const result = new Map<string, string>()
    if (refSeqIds.length === 0) {
      return result
    }
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
