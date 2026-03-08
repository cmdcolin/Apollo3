/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  assembleFeatureTrees,
  checkRegistry,
  type NestedFeature,
} from '@apollo-annotation/common'
import { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'
import {
  Assembly,
  AssemblyDocument,
  Check,
  CheckDocument,
  CheckResult,
  CheckResultDocument,
  FeatureDocument,
  RefSeq,
  RefSeqDocument,
} from '@apollo-annotation/schemas'
import {
  Inject,
  Injectable,
  Logger,
  Optional,
  forwardRef,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ObjectId } from 'mongodb'
import { Model } from 'mongoose'

import { FeatureRangeSearchDto } from '../entity/gff3Object.dto'
import { DatabaseService } from '../mikro-orm/database.service'
import { RefSeqsService } from '../refSeqs/refSeqs.service'
import { SequenceService } from '../sequence/sequence.service'

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
    @Optional()
    @InjectModel(CheckResult.name)
    private readonly checkResultModel: Model<CheckResultDocument>,
    private readonly refSeqsService: RefSeqsService,
    @Inject(forwardRef(() => SequenceService))
    private readonly sequenceService: SequenceService,
    @Optional()
    @InjectModel(Check.name)
    private readonly checkModel: Model<CheckDocument>,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(ChecksService.name)

  async find({ assembly }: { assembly?: string }) {
    if (this.db.useV2Backend) {
      if (assembly) {
        const refSeqs = await this.refSeqsService.findAll({ assembly })
        const refSeqIds = refSeqs.map((refSeq) => String(refSeq._id))
        return this.db.check.findByRefSeqIds(refSeqIds)
      }
      return this.db.check.findByRefSeqIds([])
    }
    let query = {}
    if (assembly) {
      const refSeqs = await this.refSeqsService.findAll({ assembly })
      const refSeqIds = refSeqs.map((refSeq) => refSeq._id)
      query = { refSeq: { $in: refSeqIds } }
    }
    // eslint-disable-next-line unicorn/no-array-callback-reference
    return this.checkResultModel.find(query).exec()
  }

  async getChecks() {
    if (this.db.useV2Backend) {
      return this.db.checkConfig.findAll()
    }
    return this.checkModel.find().sort({ name: 1 }).exec()
  }

  async getChecksForAssembly(featureDoc: FeatureDocument) {
    const refSeqModel = featureDoc.$model<Model<RefSeqDocument>>(RefSeq.name)
    const refSeqId = featureDoc.refSeq.toString()
    const refSeqDoc = await refSeqModel.findById(refSeqId).exec()
    if (!refSeqDoc) {
      throw new Error(`Could not find refSeq ${refSeqId}`)
    }
    const { assembly } = refSeqDoc
    const assemblyModel = featureDoc.$model<Model<AssemblyDocument>>(
      Assembly.name,
    )
    const assemblyDoc = await assemblyModel
      .findById(assembly)
      .populate('checks')
    if (!assemblyDoc) {
      throw new Error(`Could not find assembly ${assembly}`)
    }
    return assemblyDoc.checks as unknown as CheckDocument[]
  }

  async getChecksForAssemblyV2(refSeqId: string) {
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

  async checkFeatures(docs: FeatureDocument[], checkTimestamps = true) {
    if (docs.length > 1) {
      this.logger.debug(`Checking ${docs.length} features`)
    }
    let docsChecked = 1
    for (const doc of docs) {
      if (docsChecked % 1000 === 0) {
        this.logger.debug(`checked ${docsChecked} features`)
      }
      // @ts-expect-error ownerDocument does exist, TS just doesn't know it
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      if (doc.ownerDocument() === doc && doc.status === 0) {
        await this.checkFeature(doc, checkTimestamps)
      }
      docsChecked += 1
    }
  }

  async checkFeatureV2(featureId: string, checkTimestamps = true) {
    const featureRow = await this.db.feature.findById(featureId)
    if (!featureRow) {
      this.logger.warn(`Feature ${featureId} not found for check`)
      return
    }
    if (featureRow.parentId) {
      return
    }
    if (featureRow.status !== 0 && featureRow.status !== undefined) {
      return
    }
    const descendants = await this.db.feature.findDescendants(featureId)
    const allRows = [featureRow, ...descendants]
    const trees = assembleFeatureTrees(allRows)
    if (trees.length === 0) {
      return
    }
    const tree = trees[0]
    const allIds = collectAllIds(tree)
    const snapshot = tree as AnnotationFeatureSnapshot

    const checks = await this.getChecksForAssemblyV2(featureRow.refSeq)
    for (const check of checks) {
      if (
        checkTimestamps &&
        featureRow.updatedAt &&
        check.updatedAt &&
        check.updatedAt < featureRow.updatedAt
      ) {
        continue
      }
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

  async checkFeature(
    doc: FeatureDocument,
    checkTimestamps = true,
  ): Promise<void> {
    const flatDoc: AnnotationFeatureSnapshot = doc.toObject({
      flattenMaps: true,
    })
    const checks = await this.getChecksForAssembly(doc)
    for (const check of checks) {
      if (checkTimestamps && doc.updatedAt && check.updatedAt < doc.updatedAt) {
        continue
      }
      await this.clearChecksForFeature(doc, check.name)
      const c = checkRegistry.getCheck(check.name)
      if (!c) {
        throw new Error(`Check "${check.name}" not registered`)
      }
      const result = await c.checkFeature(
        flatDoc,
        (start: number, end: number) => {
          return this.getSequence({ start, end, featureDoc: doc })
        },
      )
      if (result.length > 0) {
        await this.checkResultModel.insertMany(result)
      }
    }
  }

  async getSequence({
    end,
    featureDoc,
    start,
  }: {
    end: number
    featureDoc: FeatureDocument
    start: number
  }) {
    const refSeqId = featureDoc.refSeq.toString()
    return this.sequenceService.getSequence({ start, end, refSeq: refSeqId })
  }

  async clearChecksForFeature(featureDoc: FeatureDocument, checkName: string) {
    return this.checkResultModel
      .deleteMany({ ids: { $in: featureDoc.allIds }, name: checkName })
      .exec()
  }

  async deleteChecks(checkIds: (string | ObjectId)[]) {
    if (this.db.useV2Backend) {
      return this.db.check.deleteByIds(checkIds.map((id) => String(id)))
    }
    return this.checkResultModel.deleteMany({ _id: { $in: checkIds } }).exec()
  }

  async findByFeatureId(id: string) {
    if (this.db.useV2Backend) {
      return this.db.check.findByFeatureId(id)
    }
    return this.checkResultModel.find({ ids: id }).exec()
  }

  async findByRange(searchDto: FeatureRangeSearchDto) {
    if (this.db.useV2Backend) {
      return this.db.check.findByRange(
        searchDto.refSeq,
        searchDto.start,
        searchDto.end,
      )
    }
    return this.checkResultModel
      .find({
        refSeq: searchDto.refSeq,
        start: { $lte: searchDto.end },
        end: { $gte: searchDto.start },
        status: 0,
      })
      .exec()
  }

  update(id: string, updatedCheckReport: CheckDocument) {
    if (this.db.useV2Backend) {
      return this.db.check.updateById(id, {
        name: updatedCheckReport.name,
      })
    }
    return this.checkResultModel
      .findByIdAndUpdate(id, updatedCheckReport)
      .exec()
  }
}
