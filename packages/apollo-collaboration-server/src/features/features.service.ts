/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Feature,
  FeatureDocument,
  RefSeq,
  RefSeqDocument,
} from '@apollo-annotation/schemas'
import { GetFeaturesOperation } from '@apollo-annotation/shared'
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { ChecksService } from '../checks/checks.service'
import { FeatureRangeSearchDto } from '../entity/gff3Object.dto'
import { DatabaseService } from '../mikro-orm/database.service'
import { OperationsService } from '../operations/operations.service'

import { FeatureCountRequest } from './dto/feature.dto'

@Injectable()
export class FeaturesService {
  constructor(
    private readonly operationsService: OperationsService,
    private readonly checksService: ChecksService,
    @Optional()
    @InjectModel(Feature.name)
    private readonly featureModel: Model<FeatureDocument>,
    @Optional()
    @InjectModel(RefSeq.name)
    private readonly refSeqModel: Model<RefSeqDocument>,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(FeaturesService.name)

  async findAll() {
    if (this.db.useV2Backend) {
      const refSeqs = await this.db.refSeq.findAll()
      const features = []
      for (const refSeq of refSeqs) {
        const refFeatures = await this.db.feature.findByRange(
          refSeq._id,
          0,
          Number.MAX_SAFE_INTEGER,
        )
        for (const f of refFeatures) {
          features.push(f)
        }
      }
      return features
    }
    return this.featureModel.find().exec()
  }

  async getFeatureCount(featureCountRequest: FeatureCountRequest) {
    if (this.db.useV2Backend) {
      return this.getFeatureCountV2(featureCountRequest)
    }

    let count = 0
    const { assemblyId, end, refSeqId, start } = featureCountRequest
    const filter: Record<
      string,
      number | string | { $lte: number } | { $gte: number }
    > = { status: 0 }

    if (end) {
      filter.start = { $lte: end }
    }
    if (start) {
      filter.end = { $gte: start }
    }

    if (refSeqId) {
      filter.refSeq = refSeqId
      count = await this.featureModel.countDocuments(filter)
    } else if (assemblyId) {
      const refSeqs: RefSeqDocument[] = await this.refSeqModel
        .find({ assembly: assemblyId })
        .exec()

      for (const refSeq of refSeqs) {
        filter.refSeq = refSeq._id
        count += await this.featureModel.countDocuments(filter)
      }
    } else {
      count = await this.featureModel.countDocuments(filter)
    }

    this.logger.debug(`Number of features is ${count}`)
    return count
  }

  private async getFeatureCountV2(featureCountRequest: FeatureCountRequest) {
    const { assemblyId, end, refSeqId, start } = featureCountRequest

    let count = 0
    if (refSeqId) {
      const features = await this.db.feature.findByRange(
        refSeqId,
        start ?? 0,
        end ?? Number.MAX_SAFE_INTEGER,
      )
      count = features.length
    } else if (assemblyId) {
      const refSeqs = await this.db.refSeq.findByAssembly(assemblyId)
      for (const refSeq of refSeqs) {
        const features = await this.db.feature.findByRange(
          refSeq._id,
          start ?? 0,
          end ?? Number.MAX_SAFE_INTEGER,
        )
        count += features.length
      }
    } else {
      const refSeqs = await this.db.refSeq.findAll()
      for (const refSeq of refSeqs) {
        const features = await this.db.feature.findByRange(
          refSeq._id,
          0,
          Number.MAX_SAFE_INTEGER,
        )
        count += features.length
      }
    }

    this.logger.debug(`Number of features is ${count}`)
    return count
  }

  async findById(featureId: string, topLevel?: boolean) {
    if (this.db.useV2Backend) {
      return this.findByIdV2(featureId, topLevel)
    }

    const topLevelFeature = await this.featureModel
      .findOne({ allIds: featureId })
      .exec()

    if (!topLevelFeature) {
      const errMsg = `ERROR: The following featureId was not found in database ='${featureId}'`
      this.logger.error(errMsg)
      throw new NotFoundException(errMsg)
    }

    const foundFeature = this.getFeatureFromId(
      topLevelFeature,
      featureId,
      topLevel,
    )
    if (!foundFeature) {
      const errMsg = 'ERROR when searching feature by featureId'
      this.logger.error(errMsg)
      throw new NotFoundException(errMsg)
    }
    this.logger.debug(`Feature found: ${JSON.stringify(foundFeature)}`)
    return foundFeature
  }

  private async findByIdV2(featureId: string, _topLevel?: boolean) {
    const feature = await this.db.feature.findById(featureId)
    if (!feature) {
      const errMsg = `ERROR: The following featureId was not found in database ='${featureId}'`
      this.logger.error(errMsg)
      throw new NotFoundException(errMsg)
    }
    return feature
  }

  getFeatureFromId(
    feature: Feature,
    featureId: string,
    topLevel?: boolean,
    parent?: Feature | null,
  ): Feature | null {
    this.logger.verbose(`Entry=${JSON.stringify(feature)}`)

    if (feature._id.equals(featureId)) {
      this.logger.debug(
        `Top level featureId matches in object ${JSON.stringify(feature)}`,
      )
      if (topLevel && parent) {
        return parent
      }
      return feature
    }
    this.logger.debug(
      'FeatureId was not found on top level so lets make recursive call...',
    )
    for (const [, childFeature] of feature.children ?? new Map()) {
      const subFeature = this.getFeatureFromId(
        childFeature,
        featureId,
        topLevel,
        feature,
      )
      if (subFeature) {
        if (topLevel) {
          return feature
        }
        return subFeature
      }
    }
    return null
  }

  async findByRange(searchDto: FeatureRangeSearchDto) {
    const featureDocs =
      await this.operationsService.executeOperation<GetFeaturesOperation>({
        typeName: 'GetFeaturesOperation',
        refSeq: searchDto.refSeq,
        start: searchDto.start,
        end: searchDto.end,
      })
    for (const featureDoc of featureDocs) {
      await this.checksService.checkFeature(featureDoc)
    }
    const checkResults = await this.checksService.findByRange(searchDto)
    return [featureDocs, checkResults]
  }

  async checkFeature(featureId: string, checkTimestamps = true) {
    if (this.db.useV2Backend) {
      return this.checksService.checkFeatureV2(featureId, checkTimestamps)
    }
    const topLevelFeature = await this.featureModel.findById(featureId).exec()
    if (!topLevelFeature) {
      return
    }
    return this.checksService.checkFeature(topLevelFeature, checkTimestamps)
  }

  async searchFeatures(searchDto: { term: string; assemblies: string }) {
    if (this.db.useV2Backend) {
      return this.searchFeaturesV2(searchDto)
    }

    const { assemblies, term } = searchDto
    const assemblyIds = assemblies.split(',')
    const refSeqs = await this.refSeqModel
      .find({ assembly: assemblyIds })
      .exec()
    return this.featureModel
      .find({ $text: { $search: `"${term}"` }, refSeq: refSeqs })
      .exec()
  }

  private async searchFeaturesV2(searchDto: {
    term: string
    assemblies: string
  }) {
    const { assemblies, term } = searchDto
    const assemblyIds = assemblies.split(',')
    const results = []
    for (const assemblyId of assemblyIds) {
      const refSeqs = await this.db.refSeq.findByAssembly(assemblyId)
      for (const refSeq of refSeqs) {
        const features = await this.db.feature.searchText(refSeq._id, term)
        for (const feature of features) {
          results.push(feature)
        }
      }
    }
    return results
  }
}
