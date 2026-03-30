import {
  type FeatureRepository,
  type FeatureRow,
  type NestedFeature,
  assembleFeatureTrees,
  featureId,
} from '@apollo-annotation/common'
import {
  FeatureHistoryEntity,
  mutationContext,
} from '@apollo-annotation/entities'
import {
  COMMON_CHANNEL,
  type DecodedJWT,
  type FeatureUpdateMessage,
  makeUserSessionId,
} from '@apollo-annotation/shared'
import { EntityManager } from '@mikro-orm/core'
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common'

import { ChecksService } from '../checks/checks.service.js'
import { MessagesGateway } from '../messages/messages.gateway.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

import type {
  AddFeatureDto,
  FeatureCountRequest,
  FeatureRangeSearchDto,
  FeatureUpdateDto,
  GetByIndexedIdRequest,
  MergeExonsDto,
  MergeTranscriptsDto,
  SplitExonDto,
  SplitTranscriptDto,
} from './dto/feature-schemas.js'

function doesIntersect2(s1: number, e1: number, s2: number, e2: number) {
  return s1 < e2 && s2 < e1
}

function flattenNestedFeature(
  feature: NestedFeature,
  refSeq: string,
  parentId?: string,
) {
  const rows: FeatureRow[] = []
  const row: FeatureRow = {
    _id: feature._id,
    refSeq,
    parentId,
    type: feature.type,
    min: feature.min,
    max: feature.max,
    strand: feature.strand,
    attributes: feature.attributes,
  }
  rows.push(row)
  if (feature.children) {
    for (const child of Object.values(feature.children)) {
      const childRows = flattenNestedFeature(child, refSeq, feature._id)
      for (const cr of childRows) {
        rows.push(cr)
      }
    }
  }
  return rows
}

interface CheckResultData {
  _id: string
  name: string
  cause?: string
  featureId: string
  refSeq: string
  start: number
  end: number
  ignored: boolean
  message?: string
}

interface MutationResult {
  features: NestedFeature[]
  deletedFeatureIds: string[]
  changeSequence: number
  assemblyId: string
  checkResults?: CheckResultData[]
}

@Injectable()
export class FeaturesService {
  constructor(
    @Inject(ChecksService) private readonly checksService: ChecksService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(MessagesGateway) private readonly messagesGateway: MessagesGateway,
    @Inject(EntityManager) private readonly em: EntityManager,
  ) {}

  private readonly logger = new Logger(FeaturesService.name)

  // --- Read operations (unchanged) ---

  async findAll() {
    return this.db.feature.findAll()
  }

  async getFeatureCount(featureCountRequest: FeatureCountRequest) {
    const { assemblyId, end, refSeqId, start } = featureCountRequest

    let count = 0
    if (refSeqId) {
      count = await this.db.feature.countByRange(
        refSeqId,
        start ?? 0,
        end ?? Number.MAX_SAFE_INTEGER,
      )
    } else if (assemblyId) {
      const refSeqs = await this.db.refSeq.findByAssembly(assemblyId)
      const refSeqIds = refSeqs.map((rs) => rs._id)
      count = await this.db.feature.countByRangeMultiple(
        refSeqIds,
        start ?? 0,
        end ?? Number.MAX_SAFE_INTEGER,
      )
    } else {
      count = await this.db.feature.countAll()
    }

    this.logger.debug(`Number of features is ${count}`)
    return count
  }

  async getByIndexedId(getByIndexedIdRequest: GetByIndexedIdRequest) {
    const { assemblies, id, topLevel } = getByIndexedIdRequest
    let refSeqIds: string[] | undefined
    if (assemblies) {
      const assemblyIds = assemblies.split(',')
      const refSeqs = await this.db.refSeq.findByAssemblies(assemblyIds)
      refSeqIds = refSeqs.map((rs) => rs._id)
    }
    const topLevelFeatures = await this.db.feature.findByIndexedId(
      id,
      refSeqIds,
    )
    if (topLevelFeatures.length === 0) {
      return []
    }
    if (topLevel) {
      return topLevelFeatures
    }
    const results: FeatureRow[] = []
    for (const rootFeature of topLevelFeatures) {
      const match = await this.findFeatureWithAttribute(rootFeature, id)
      if (match) {
        results.push(match)
      }
    }
    return results
  }

  private async findFeatureWithAttribute(
    rootFeature: FeatureRow,
    value: string,
  ) {
    const descendants = await this.db.feature.findDescendants(rootFeature._id)
    for (const feature of [rootFeature, ...descendants]) {
      if (feature.attributes) {
        const hasMatch = Object.values(feature.attributes).some((vals) =>
          vals.includes(value),
        )
        if (hasMatch) {
          return feature
        }
      }
    }
    return
  }

  async findByFeatureIds(featureIds: string[], topLevel?: boolean) {
    const uniqueIds = [...new Set(featureIds)]
    if (topLevel) {
      return this.db.feature.findRootParentsOfMany(uniqueIds)
    }
    return this.db.feature.findByIds(uniqueIds)
  }

  async findById(featureId: string, topLevel?: boolean) {
    const feature = await this.db.feature.findById(featureId)
    if (!feature) {
      throw new NotFoundException(`Feature not found: ${featureId}`)
    }
    if (topLevel && feature.parentId) {
      const rootFeature = await this.db.feature.findRootParent(featureId)
      if (rootFeature) {
        return rootFeature
      }
    }
    return feature
  }

  async findFeaturesByRange(searchDto: FeatureRangeSearchDto) {
    const roots = await this.db.feature.findRootsByRange(
      searchDto.refSeq,
      searchDto.start,
      searchDto.end,
    )
    if (roots.length === 0) {
      return []
    }
    const rootIds = roots.map((r) => r._id)
    const descendants = await this.db.feature.findDescendantsOfMany(rootIds)
    return assembleFeatureTrees([...roots, ...descendants])
  }

  async checkFeature(featureId: string) {
    return this.checksService.checkFeature(featureId)
  }

  async searchFeatures(searchDto: { term: string; assemblies: string }) {
    const { assemblies, term } = searchDto
    const assemblyNames = assemblies.split(',')
    const assemblyRows = await this.db.assembly.findByNames(assemblyNames)
    const assemblyIds = assemblyRows.map((a) => a._id)
    const refSeqs = await this.db.refSeq.findByAssemblies(assemblyIds)
    const refSeqIds = refSeqs.map((rs) => rs._id)
    return this.db.feature.searchText(refSeqIds, term)
  }

  // --- Mutation helpers ---

  private async getAssemblyForFeature(featureId: string) {
    const feature = await this.db.feature.findById(featureId)
    if (!feature) {
      throw new NotFoundException(`Feature not found: ${featureId}`)
    }
    const name = await this.db.getAssemblyNameByRefSeq(feature.refSeq)
    if (!name) {
      throw new NotFoundException(`Assembly not found for feature: ${featureId}`)
    }
    return name
  }

  private async getRootFeatureTrees(featureIds: string[]) {
    const rootFeatures = await this.db.feature.findRootParentsOfMany(featureIds)
    if (rootFeatures.length === 0) {
      return []
    }
    const rootIds = rootFeatures.map((r) => r._id)
    const descendants =
      await this.db.feature.findDescendantsOfMany(rootIds)
    return assembleFeatureTrees([...rootFeatures, ...descendants])
  }

  private async broadcastAndCheck(
    result: MutationResult,
    user: DecodedJWT,
    affectedFeatureIds: string[],
  ) {
    const rootFeatures =
      await this.db.feature.findRootParentsOfMany(affectedFeatureIds)
    for (const root of rootFeatures) {
      await this.checksService.checkFeature(root._id)
    }

    // Collect check results for all affected features so the client
    // can update its check result store without a separate fetch
    const rootIds = rootFeatures.map((r) => r._id)
    const descendants = await this.db.feature.findDescendantsOfMany(rootIds)
    const allIds = [...rootIds, ...descendants.map((d) => d._id)]
    const checkResults: CheckResultData[] = []
    for (const fid of allIds) {
      const results = await this.db.check.findByFeatureId(fid)
      for (const r of results) {
        checkResults.push(r)
      }
    }
    result.checkResults = checkResults

    const userSessionId = makeUserSessionId(user)
    const message: FeatureUpdateMessage = {
      channel: COMMON_CHANNEL,
      userName: user.username,
      userSessionId,
      changeSequence: result.changeSequence,
      assemblyId: result.assemblyId,
      features: result.features,
      deletedFeatureIds: result.deletedFeatureIds,
    }
    this.messagesGateway.emitToAssembly(
      result.assemblyId,
      COMMON_CHANNEL,
      message,
    )

    return result
  }

  // --- Mutation operations ---

  private async propagateAncestorBounds(
    featureId: string,
    featureRepository: FeatureRepository,
  ) {
    let currentId: string | undefined = featureId
    while (currentId) {
      const children = await featureRepository.findChildren(currentId)
      if (children.length > 0) {
        let newMin = Infinity
        let newMax = -Infinity
        for (const c of children) {
          newMin = Math.min(newMin, c.min)
          newMax = Math.max(newMax, c.max)
        }
        await featureRepository.updateById(currentId, {
          min: newMin,
          max: newMax,
        })
      }
      const current = await featureRepository.findById(currentId)
      currentId = current?.parentId
    }
  }

  async updateFeature(featureId: string, dto: FeatureUpdateDto, user: DecodedJWT) {
    const assemblyId = await this.getAssemblyForFeature(featureId)

    const sequence = await this.db.transactional(async (scope) => {
      const seq = await scope.counter.getNextSequenceValue('changeCounter')
      return mutationContext.run({ sequence: seq, user: user.email }, async () => {
        const feature = await scope.feature.findById(featureId)
        if (!feature) {
          throw new NotFoundException(`Feature not found: ${featureId}`)
        }
        await scope.feature.updateById(featureId, dto)
        if (dto.min !== undefined || dto.max !== undefined) {
          await this.propagateAncestorBounds(featureId, scope.feature)
        }
        return seq
      })
    })

    const features = await this.getRootFeatureTrees([featureId])

    const result: MutationResult = {
      features,
      deletedFeatureIds: [],
      changeSequence: sequence,
      assemblyId,
    }
    return this.broadcastAndCheck(result, user, [featureId])
  }

  async addFeature(dto: AddFeatureDto, user: DecodedJWT) {
    const { addedFeature, assemblyId, parentFeatureId } = dto

    const sequence = await this.db.transactional(async (scope) => {
      const seq = await scope.counter.getNextSequenceValue('changeCounter')
      return mutationContext.run({ sequence: seq, user: user.email }, async () => {
        const refSeqs = await scope.refSeq.findByAssembly(assemblyId)
        const refSeq = refSeqs.find((rs) => rs.name === addedFeature.refSeq || rs._id === addedFeature.refSeq)
        if (!refSeq) {
          throw new BadRequestException(
            `RefSeq not found: ${addedFeature.refSeq} in assembly ${assemblyId}`,
          )
        }
        const rows = flattenNestedFeature(addedFeature, refSeq._id)
        if (parentFeatureId && rows.length > 0) {
          rows[0].parentId = parentFeatureId
        }
        await scope.feature.createMany(rows)
        return seq
      })
    })

    const featureIds: string[] = [String(addedFeature._id)]
    if (parentFeatureId) {
      featureIds.push(parentFeatureId)
    }
    const features = await this.getRootFeatureTrees(featureIds)

    const result: MutationResult = {
      features,
      deletedFeatureIds: [],
      changeSequence: sequence,
      assemblyId,
    }
    return this.broadcastAndCheck(result, user, featureIds)
  }

  async deleteFeature(featureId: string, user: DecodedJWT) {
    const assemblyId = await this.getAssemblyForFeature(featureId)
    const feature = await this.db.feature.findById(featureId)
    if (!feature) {
      throw new NotFoundException(`Feature not found: ${featureId}`)
    }
    const { parentId } = feature

    const sequence = await this.db.transactional(async (scope) => {
      const seq = await scope.counter.getNextSequenceValue('changeCounter')
      return mutationContext.run({ sequence: seq, user: user.email }, async () => {
        await scope.feature.deleteDescendants(featureId)
        await scope.feature.deleteById(featureId)
        if (parentId) {
          await this.propagateAncestorBounds(parentId, scope.feature)
        }
        return seq
      })
    })

    const deletedFeatureIds = [featureId]
    const features = parentId
      ? await this.getRootFeatureTrees([parentId])
      : []

    const result: MutationResult = {
      features,
      deletedFeatureIds,
      changeSequence: sequence,
      assemblyId,
    }
    if (parentId) {
      return this.broadcastAndCheck(result, user, [parentId])
    }
    return this.broadcastAndCheck(result, user, [])
  }

  async mergeExons(dto: MergeExonsDto, user: DecodedJWT) {
    const { firstExonId, secondExonId } = dto
    const assemblyId = await this.getAssemblyForFeature(firstExonId)

    const sequence = await this.db.transactional(async (scope) => {
      const seq = await scope.counter.getNextSequenceValue('changeCounter')
      return mutationContext.run({ sequence: seq, user: user.email }, async () => {
        const firstExon = await scope.feature.findById(firstExonId)
        if (!firstExon) {
          throw new NotFoundException(`Feature not found: ${firstExonId}`)
        }
        const secondExon = await scope.feature.findById(secondExonId)
        if (!secondExon) {
          throw new NotFoundException(`Feature not found: ${secondExonId}`)
        }

        const mergedAttributes: Record<string, string[]> = firstExon.attributes
          ? structuredClone(firstExon.attributes)
          : {}
        const secondAttrs: Record<string, string[]> = secondExon.attributes ?? {}
        mergedAttributes.merged_with = [JSON.stringify(secondAttrs)]

        await scope.feature.updateById(firstExonId, {
          min: Math.min(firstExon.min, secondExon.min),
          max: Math.max(firstExon.max, secondExon.max),
          attributes: mergedAttributes,
        })
        await scope.feature.deleteDescendants(secondExonId)
        await scope.feature.deleteById(secondExonId)
        return seq
      })
    })

    const features = await this.getRootFeatureTrees([firstExonId])

    const result: MutationResult = {
      features,
      deletedFeatureIds: [secondExonId],
      changeSequence: sequence,
      assemblyId,
    }
    return this.broadcastAndCheck(result, user, [firstExonId])
  }

  async splitExon(dto: SplitExonDto, user: DecodedJWT) {
    const { exonId, splitPoint } = dto
    const assemblyId = await this.getAssemblyForFeature(exonId)
    const leftExonId = featureId()
    const rightExonId = featureId()

    const sequence = await this.db.transactional(async (scope) => {
      const seq = await scope.counter.getNextSequenceValue('changeCounter')
      return mutationContext.run({ sequence: seq, user: user.email }, async () => {
        const exon = await scope.feature.findById(exonId)
        if (!exon) {
          throw new NotFoundException(`Feature not found: ${exonId}`)
        }
        if (!exon.parentId) {
          throw new BadRequestException('Cannot split exon without a parent')
        }

        const leftRow: FeatureRow = {
          _id: leftExonId,
          refSeq: exon.refSeq,
          parentId: exon.parentId,
          type: exon.type,
          min: exon.min,
          max: splitPoint,
          strand: exon.strand,
          attributes: exon.attributes
            ? { ...exon.attributes }
            : undefined,
        }
        const rightRow: FeatureRow = {
          _id: rightExonId,
          refSeq: exon.refSeq,
          parentId: exon.parentId,
          type: exon.type,
          min: splitPoint,
          max: exon.max,
          strand: exon.strand,
          attributes: exon.attributes
            ? { ...exon.attributes }
            : undefined,
        }

        await scope.feature.createMany([leftRow, rightRow])
        await scope.feature.deleteDescendants(exonId)
        await scope.feature.deleteById(exonId)
        return seq
      })
    })

    const features = await this.getRootFeatureTrees([leftExonId, rightExonId])

    const result: MutationResult = {
      features,
      deletedFeatureIds: [exonId],
      changeSequence: sequence,
      assemblyId,
    }
    return this.broadcastAndCheck(result, user, [leftExonId, rightExonId])
  }

  async mergeTranscripts(dto: MergeTranscriptsDto, user: DecodedJWT) {
    const { firstTranscriptId, secondTranscriptId } = dto
    const assemblyId = await this.getAssemblyForFeature(firstTranscriptId)

    const sequence = await this.db.transactional(async (scope) => {
      const seq = await scope.counter.getNextSequenceValue('changeCounter')
      return mutationContext.run({ sequence: seq, user: user.email }, async () => {
        const firstRow = await scope.feature.findById(firstTranscriptId)
        if (!firstRow) {
          throw new NotFoundException(`Feature not found: ${firstTranscriptId}`)
        }
        const secondRow = await scope.feature.findById(secondTranscriptId)
        if (!secondRow) {
          throw new NotFoundException(`Feature not found: ${secondTranscriptId}`)
        }

        const mergedAttributes: Record<string, string[]> = firstRow.attributes
          ? structuredClone(firstRow.attributes)
          : {}
        if (secondRow.attributes) {
          const existing = mergedAttributes.merged_with ?? []
          existing.push(JSON.stringify(secondRow.attributes))
          mergedAttributes.merged_with = existing
        }

        await scope.feature.updateById(firstTranscriptId, {
          min: Math.min(firstRow.min, secondRow.min),
          max: Math.max(firstRow.max, secondRow.max),
          attributes: mergedAttributes,
        })

        const secondChildren = await scope.feature.findChildren(secondTranscriptId)
        for (const secondChild of secondChildren) {
          await this.mergeFeatureIntoTranscript(
            secondChild,
            firstTranscriptId,
            firstRow.refSeq,
            scope.feature,
          )
        }

        await scope.feature.deleteById(secondTranscriptId)
        return seq
      })
    })

    const features = await this.getRootFeatureTrees([firstTranscriptId])

    const result: MutationResult = {
      features,
      deletedFeatureIds: [secondTranscriptId],
      changeSequence: sequence,
      assemblyId,
    }
    return this.broadcastAndCheck(result, user, [firstTranscriptId])
  }

  private async mergeFeatureIntoTranscript(
    secondChild: FeatureRow,
    firstTranscriptId: string,
    refSeq: string,
    featureRepository: FeatureRepository,
  ) {
    const firstChildren =
      await featureRepository.findChildren(firstTranscriptId)
    let merged = false
    let mrgChild: FeatureRow | undefined
    let toDelete: FeatureRow | undefined

    for (const firstChild of firstChildren) {
      if (!merged || !mrgChild) {
        toDelete = undefined
        mrgChild = firstChild
      } else {
        toDelete = firstChild
      }
      if (
        mrgChild.type === secondChild.type &&
        mrgChild.type === firstChild.type &&
        doesIntersect2(
          secondChild.min,
          secondChild.max,
          mrgChild.min,
          mrgChild.max,
        ) &&
        doesIntersect2(
          firstChild.min,
          firstChild.max,
          mrgChild.min,
          mrgChild.max,
        )
      ) {
        const newMin = Math.min(secondChild.min, mrgChild.min, firstChild.min)
        const newMax = Math.max(secondChild.max, mrgChild.max, firstChild.max)

        const mrgChildAttr: Record<string, string[]> = mrgChild.attributes
          ? structuredClone(mrgChild.attributes)
          : {}
        const existingMergedWith = mrgChildAttr.merged_with ?? []
        existingMergedWith.push(JSON.stringify(secondChild.attributes ?? {}))

        if (toDelete) {
          existingMergedWith.push(JSON.stringify(toDelete.attributes ?? {}))
          const grandchildren = await featureRepository.findChildren(
            toDelete._id,
          )
          for (const gc of grandchildren) {
            await featureRepository.updateById(gc._id, {
              parentId: mrgChild._id,
            })
          }
          await featureRepository.deleteById(toDelete._id)
        }

        mrgChildAttr.merged_with = [...new Set(existingMergedWith)]
        await featureRepository.updateById(mrgChild._id, {
          min: newMin,
          max: newMax,
          attributes: mrgChildAttr,
        })
        merged = true
      }
    }

    if (merged && mrgChild) {
      const secondGrandchildren = await featureRepository.findChildren(
        secondChild._id,
      )
      for (const gc of secondGrandchildren) {
        await featureRepository.updateById(gc._id, {
          parentId: mrgChild._id,
        })
      }
    }

    if (!merged) {
      await featureRepository.updateById(secondChild._id, {
        parentId: firstTranscriptId,
      })
    }
  }

  async splitTranscript(dto: SplitTranscriptDto, user: DecodedJWT) {
    const { transcriptId, splitPoint } = dto
    const assemblyId = await this.getAssemblyForFeature(transcriptId)
    const leftTranscriptId = featureId()
    const rightTranscriptId = featureId()

    const sequence = await this.db.transactional(async (scope) => {
      const seq = await scope.counter.getNextSequenceValue('changeCounter')
      return mutationContext.run({ sequence: seq, user: user.email }, async () => {
        const transcript = await scope.feature.findById(transcriptId)
        if (!transcript) {
          throw new NotFoundException(`Feature not found: ${transcriptId}`)
        }
        if (!transcript.parentId) {
          throw new BadRequestException(
            'Cannot split transcript without a parent',
          )
        }

        const children = await scope.feature.findChildren(transcriptId)
        const leftChildren: FeatureRow[] = []
        const rightChildren: FeatureRow[] = []

        for (const child of children) {
          const midpoint = (child.min + child.max) / 2
          if (midpoint <= splitPoint) {
            leftChildren.push(child)
          } else {
            rightChildren.push(child)
          }
        }

        let leftMin = transcript.min
        let leftMax = splitPoint
        let rightMin = splitPoint
        let rightMax = transcript.max

        if (leftChildren.length > 0) {
          leftMin = Math.min(...leftChildren.map((c) => c.min))
          leftMax = Math.max(...leftChildren.map((c) => c.max))
        }
        if (rightChildren.length > 0) {
          rightMin = Math.min(...rightChildren.map((c) => c.min))
          rightMax = Math.max(...rightChildren.map((c) => c.max))
        }

        const leftRow: FeatureRow = {
          _id: leftTranscriptId,
          refSeq: transcript.refSeq,
          parentId: transcript.parentId,
          type: transcript.type,
          min: leftMin,
          max: leftMax,
          strand: transcript.strand,
          attributes: transcript.attributes
            ? { ...transcript.attributes }
            : undefined,
        }
        const rightRow: FeatureRow = {
          _id: rightTranscriptId,
          refSeq: transcript.refSeq,
          parentId: transcript.parentId,
          type: transcript.type,
          min: rightMin,
          max: rightMax,
          strand: transcript.strand,
          attributes: transcript.attributes
            ? { ...transcript.attributes }
            : undefined,
        }
        await scope.feature.createMany([leftRow, rightRow])

        for (const child of leftChildren) {
          await scope.feature.updateById(child._id, {
            parentId: leftTranscriptId,
          })
        }
        for (const child of rightChildren) {
          await scope.feature.updateById(child._id, {
            parentId: rightTranscriptId,
          })
        }

        await scope.feature.deleteById(transcriptId)

        const { parentId: geneId } = transcript
        const siblings = await scope.feature.findChildren(geneId)
        if (siblings.length > 0) {
          const newMin = Math.min(...siblings.map((s) => s.min))
          const newMax = Math.max(...siblings.map((s) => s.max))
          await scope.feature.updateById(geneId, {
            min: newMin,
            max: newMax,
          })
        }

        return seq
      })
    })

    const features = await this.getRootFeatureTrees([
      leftTranscriptId,
      rightTranscriptId,
    ])

    const result: MutationResult = {
      features,
      deletedFeatureIds: [transcriptId],
      changeSequence: sequence,
      assemblyId,
    }
    return this.broadcastAndCheck(result, user, [
      leftTranscriptId,
      rightTranscriptId,
    ])
  }

  async undoChange(targetSequence: number, user: DecodedJWT) {
    const historyRecords = await this.em.fork().find(
      FeatureHistoryEntity,
      { sequence: targetSequence },
      { orderBy: { changedAt: 'ASC' } },
    )
    if (historyRecords.length === 0) {
      throw new NotFoundException(
        `No history found for sequence ${targetSequence}`,
      )
    }

    if (user.role !== 'admin') {
      const otherAuthor = historyRecords.find(
        (r) => r.changedBy !== null && r.changedBy !== user.email,
      )
      if (otherAuthor) {
        throw new ForbiddenException(
          'You can only undo your own changes. Admin role is required to undo changes made by other users.',
        )
      }
    }

    const affectedFeatureIds: string[] = []
    const deletedFeatureIds: string[] = []
    const [firstRecord] = historyRecords
    const firstRefSeq: string = firstRecord.refSeq

    const assemblyId = await this.db.getAssemblyNameByRefSeq(firstRefSeq)
    if (!assemblyId) {
      throw new NotFoundException(`Assembly not found for refSeq: ${firstRefSeq}`)
    }

    const undoSequence = await this.db.transactional(async (scope) => {
      const seq = await scope.counter.getNextSequenceValue('changeCounter')
      return mutationContext.run({ sequence: seq, user: user.email }, async () => {
        for (const record of historyRecords) {
          switch (record.changeType) {
            case 'insert': {
              // Feature was created — undo by deleting it
              await scope.feature.deleteDescendants(record.featureId)
              await scope.feature.deleteById(record.featureId)
              deletedFeatureIds.push(record.featureId)
              break
            }
            case 'update': {
              // Record has the pre-update state — restore it
              await scope.feature.updateById(record.featureId, {
                type: record.type,
                min: record.min,
                max: record.max,
                strand: (record.strand ?? undefined) as 1 | -1 | undefined,
                phase: (record.phase ?? undefined) as 0 | 1 | 2 | undefined,
                attributes: record.attributes ?? undefined,
              })
              affectedFeatureIds.push(record.featureId)
              break
            }
            case 'delete': {
              // Feature was deleted — undo by re-creating it
              await scope.feature.create({
                _id: record.featureId,
                refSeq: record.refSeq,
                parentId: record.parentId ?? undefined,
                type: record.type,
                min: record.min,
                max: record.max,
                strand: (record.strand ?? undefined) as 1 | -1 | undefined,
                phase: (record.phase ?? undefined) as 0 | 1 | 2 | undefined,
                attributes: record.attributes ?? undefined,
              })
              affectedFeatureIds.push(record.featureId)
              break
            }
          }
        }

        // Propagate bounds for any restored/updated features
        for (const fid of affectedFeatureIds) {
          await this.propagateAncestorBounds(fid, scope.feature)
        }

        return seq
      })
    })

    const allAffected = [...affectedFeatureIds, ...deletedFeatureIds]
    const features = affectedFeatureIds.length > 0
      ? await this.getRootFeatureTrees(affectedFeatureIds)
      : []

    const result: MutationResult = {
      features,
      deletedFeatureIds,
      changeSequence: undoSequence,
      assemblyId,
    }
    return this.broadcastAndCheck(result, user, allAffected)
  }
}
