import {
  type NestedFeature,
  assembleFeatureTrees,
  checkRegistry,
} from '@apollo-annotation/common'
import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'
import { Inject, Injectable, Logger, forwardRef } from '@nestjs/common'

import type { FeatureRangeSearchDto } from '../features/dto/feature-schemas.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
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
    @Inject(forwardRef(() => SequenceService))
    private readonly sequenceService: Readonly<SequenceService>,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(ChecksService.name)

  async find({ assembly }: { assembly?: string }) {
    if (assembly) {
      return this.db.check.findByAssembly(assembly)
    }
    return this.db.check.findByAssembly('')
  }

  async getChecks() {
    return this.db.checkConfig.findAll()
  }

  async getChecksForAssembly(assemblyId: string) {
    const assembly = await this.db.assembly.findById(assemblyId)
    if (!assembly || !assembly.checks || assembly.checks.length === 0) {
      return []
    }
    return this.db.checkConfig.findByIds(assembly.checks)
  }

  async checkFeature(featureId: string) {
    const featureRow = await this.db.feature.findById(featureId)
    if (!featureRow) {
      this.logger.warn(`Feature ${featureId} not found for check`)
      return
    }
    if (featureRow.parentId) {
      this.logger.debug(`Skipping check for child feature ${featureId}`)
      return
    }
    const descendants = await this.db.feature.findDescendants(featureId)
    const allRows = [featureRow, ...descendants]
    const trees = assembleFeatureTrees(allRows)
    if (trees.length === 0) {
      this.logger.warn(`No feature trees assembled for ${featureId}`)
      return
    }
    const [tree] = trees
    const allIds = collectAllIds(tree)
    const snapshot = tree as AnnotationFeatureSnapshot

    const checks = await this.getChecksForAssembly(featureRow.assembly)
    const assembly = await this.db.assembly.findById(featureRow.assembly)
    const assemblyName = assembly?.name ?? ''
    this.logger.debug(
      `Running ${checks.length} checks on feature ${featureId} (${allRows.length} rows)`,
    )
    for (const check of checks) {
      await this.db.check.deleteByFeatureIdsAndName(allIds, check.name)
      const c = checkRegistry.getCheck(check.name)
      try {
        const result = await c.checkFeature(
          snapshot,
          (start: number, end: number) => {
            return this.sequenceService.getSequence({
              assembly: assemblyName,
              start,
              end,
              refSeq: featureRow.refSeq,
            })
          },
        )
        this.logger.debug(
          `Check ${check.name} returned ${result.length} results for feature ${featureId}`,
        )
        if (result.length > 0) {
          const rows = result.map((r) => ({
            _id: r._id,
            name: r.name,
            cause: r.cause,
            featureId: r.featureId,
            assembly: featureRow.assembly,
            refSeq: r.refSeq,
            start: r.start,
            end: r.end,
            ignored: r.ignored ?? false,
            message: r.message,
          }))
          await this.db.check.createMany(rows)
        }
      } catch (error) {
        this.logger.error(
          `Check ${check.name} failed for feature ${featureId}: ${error}`,
        )
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
      searchDto.assembly,
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
