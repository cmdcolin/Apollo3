import {
  Controller,
  Get,
  Inject,
  Param,
  ParseIntPipe,
  Query,
} from '@nestjs/common'
import { FeatureHistoryEntity } from '@apollo-annotation/entities'
import { EntityManager } from '@mikro-orm/core'

import { Roles } from '../authentication/roles.guard.js'
import { Role } from '../authentication/role.enum.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

function toChangeRow(r: { _id: string; sequence: number | null; changeType: string; type: string; changedBy: string | null; featureId: string; changedAt: Date }) {
  return {
    _id: r._id,
    sequence: r.sequence,
    typeName: `${r.changeType} ${r.type}`,
    user: r.changedBy ?? 'unknown',
    changedIds: [r.featureId],
    createdAt: r.changedAt.toISOString(),
  }
}

@Controller('changes')
export class ChangesController {
  constructor(
    @Inject(EntityManager) private readonly em: EntityManager,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  @Roles(Role.ReadOnly)
  @Get('recent')
  async getRecentChanges(
    @Query('limit', new ParseIntPipe({ optional: true })) limit?: number,
    @Query('page', new ParseIntPipe({ optional: true })) page?: number,
  ) {
    const take = limit ?? 25
    const skip = ((page ?? 1) - 1) * take

    const rows = await this.em.fork().find(
      FeatureHistoryEntity,
      {},
      {
        orderBy: { changedAt: 'DESC' },
        limit: take,
        offset: skip,
      },
    )

    return rows.map(toChangeRow)
  }

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
    const [changes, total] = await Promise.all([
      fork.find(FeatureHistoryEntity, where, {
        orderBy: { changedAt: 'DESC' },
        limit: take,
        offset: skip,
      }),
      fork.count(FeatureHistoryEntity, where),
    ])

    return {
      changes: changes.map(toChangeRow),
      total,
      page: page ?? 1,
      limit: take,
    }
  }
}
