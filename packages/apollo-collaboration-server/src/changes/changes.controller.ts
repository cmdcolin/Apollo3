import { Controller, Get, Inject, Param } from '@nestjs/common'
import { FeatureHistoryEntity } from '@apollo-annotation/entities'
import { EntityManager } from '@mikro-orm/core'

import { Roles } from '../authentication/roles.guard.js'
import { Role } from '../authentication/role.enum.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

@Roles(Role.ReadOnly)
@Controller('changes')
export class ChangesController {
  constructor(
    @Inject(EntityManager) private readonly em: EntityManager,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  @Get('recent')
  async getRecentChanges() {
    const em = this.em.fork()
    const rows = await em.find(
      FeatureHistoryEntity,
      {},
      { orderBy: { changedAt: 'DESC' }, limit: 1000 },
    )

    const assemblyIds = [...new Set(rows.filter((r) => r.assembly).map((r) => r.assembly as string))]
    const assemblies = await Promise.all(
      assemblyIds.map((id) => this.db.assembly.findById(id)),
    )
    const assemblyIdToName = new Map<string, string>()
    for (const a of assemblies) {
      if (a) {
        assemblyIdToName.set(a._id, a.name)
      }
    }

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
        assembly: first.assembly ? assemblyIdToName.get(first.assembly) : undefined,
        changeTypes,
        featureTypes,
        featureIds,
        summary: `${changeTypes.join('/')} ${featureIds.length} feature${featureIds.length > 1 ? 's' : ''} (${featureTypes.join(', ')})`,
      }
    })

    return { changes }
  }

  @Get('gene/:featureId')
  async getGeneHistory(@Param('featureId') featureId: string) {
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
}
