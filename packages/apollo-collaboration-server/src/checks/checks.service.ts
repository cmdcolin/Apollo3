import {
  type NestedFeature,
  assembleFeatureTrees,
  checkRegistry,
} from '@apollo-annotation/common'
import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common'

import type { FeatureRangeSearchDto } from '../entity/gff3Object.dto.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { RefSeqsService } from '../refSeqs/refSeqs.service.js'
import { SequenceService } from '../sequence/sequence.service.js'

function collectAllIds(tree: NestedFeature): string[] {
  const ids = [tree._id]
  if (tree.children) {
    for (const child of Object.values(tree.children)) {
      for (const id of collectAllIds(child)) {
        ids.push(id)
      }
    }
  }
  return ids
}

@Injectable()
export class ChecksService {
  constructor(
    private readonly refSeqsService: RefSeqsService,
    @Inject(forwardRef(() => SequenceService))
    private readonly sequenceService: Readonly<SequenceService>,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(ChecksService.name)

  async find({ assembly }: { assembly?: string }) {
    if (assembly) {
      const refSeqs = await this.refSeqsService.findAll({ assembly })
      const refSeqIds = refSeqs.map((refSeq) => String(refSeq._id))
      return this.db.check.findByRefSeqIds(refSeqIds)
    }
    return this.db.check.findByRefSeqIds([])
  }

  async getChecks() {
    return this.db.checkConfig.findAll()
  }

  async getChecksForAssembly(refSeqId: string) {
    const refSeq = await this.db.refSeq.findById(refSeqId)
    if (!refSeq) {
      throw new Error(`Could not find refSeq ${refSeqId}`)
    }
    const assembly = await this.db.assembly.findById(refSeq.assembly)
    if (!assembly) {
      throw new Error(`Could not find assembly ${refSeq.assembly}`)
    }
    if (!assembly.checks || assembly.checks.length === 0) {
      return []
    }
    return this.db.checkConfig.findByIds(assembly.checks)
  }

  async checkFeature(featureId: string, checkTimestamps = true) {
    const featureRow = await this.db.feature.findById(featureId)
    if (!featureRow) {
      this.logger.warn(`Feature ${featureId} not found for check`)
      return
    }
    if (featureRow.parentId) {
      return
    }
    if (featureRow.status != null && featureRow.status !== 0) {
      return
    }
    const descendants = await this.db.feature.findDescendants(featureId)
    const allRows = [featureRow, ...descendants]
    const trees = assembleFeatureTrees(allRows)
    if (trees.length === 0) {
      return
    }
    const tree = trees[0]
    if (!tree) {
      return
    }
    const allIds = collectAllIds(tree)
    const snapshot = tree as AnnotationFeatureSnapshot

    const checks = await this.getChecksForAssembly(featureRow.refSeq)
    for (const check of checks) {
      await this.db.check.deleteByFeatureIdsAndName(allIds, check.name)
      const c = checkRegistry.getCheck(check.name)
      if (!c) {
        throw new Error(`Check "${check.name}" not registered`)
      }
      const result = await c.checkFeature(
        snapshot,
        (start: number, end: number) => {
          return this.sequenceService.getSequence({
            start,
            end,
            refSeq: featureRow.refSeq,
          })
        },
      )
      if (result.length > 0) {
        const rows = result.map((r) => ({
          _id: r._id,
          name: r.name,
          cause: r.cause,
          ids: (r.ids ?? []).filter((id): id is string => id !== undefined),
          refSeq: r.refSeq,
          start: r.start,
          end: r.end,
          ignored: r.ignored ?? false,
          message: r.message,
        }))
        await this.db.check.createMany(rows)
      }
    }
  }

  async deleteChecks(checkIds: string[]) {
    return this.db.check.deleteByIds(checkIds)
  }

  async findByFeatureId(id: string) {
    return this.db.check.findByFeatureId(id)
  }

  async findByRange(searchDto: FeatureRangeSearchDto) {
    return this.db.check.findByRange(
      searchDto.refSeq,
      searchDto.start,
      searchDto.end,
    )
  }

  update(id: string, updatedCheckReport: { name: string }) {
    return this.db.check.updateById(id, {
      name: updatedCheckReport.name,
    })
  }
}
