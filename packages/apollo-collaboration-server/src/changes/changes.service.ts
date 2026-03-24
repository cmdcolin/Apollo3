import {
  type Change as BaseChange,
  type ServerDataStore,
  isAssemblySpecificChange,
  isFeatureChange,
} from '@apollo-annotation/common'
import {
  COMMON_CHANNEL,
  type ChangeMessage,
  type DecodedJWT,
  makeUserSessionId,
} from '@apollo-annotation/shared'
import { type GFF3Feature, GFFTransformer } from '@gmod/gff'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { TransformStream } from 'node:stream/web'

import { ChecksService } from '../checks/checks.service.js'
import { MessagesGateway } from '../messages/messages.gateway.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { PluginsService } from '../plugins/plugins.service.js'

import type { FindChangeDto } from './dto/find-change.dto.js'

@Injectable()
export class ChangesService {
  constructor(
    @Inject(PluginsService) private readonly pluginsService: PluginsService,
    @Inject(MessagesGateway) private readonly messagesGateway: MessagesGateway,
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(ChecksService) private readonly checksService: ChecksService,
  ) {}

  private buildServerDataStore(
    scope: import('../mikro-orm/database.service.js').TransactionScope,
    user: string,
  ): ServerDataStore {
    return {
      typeName: 'Server',
      featureRepository: scope.feature,
      assemblyRepository: scope.assembly,
      refSeqRepository: scope.refSeq,
      checkRepository: scope.checkConfig,
      checkResultRepository: scope.check,
      userRepository: scope.user,
      jbrowseConfigRepository: scope.jbrowseConfig,
      parseGFF3(
        stream: ReadableStream<Uint8Array>,
        options?: { bufferSize?: number },
      ): ReadableStream<GFF3Feature> {
        return stream.pipeThrough(
          new TransformStream(
            new GFFTransformer({
              parseSequences: false,
              parseComments: false,
              parseDirectives: false,
              parseFeatures: true,
              ...options,
            }),
          ),
        )
      },
      pluginsService: this.pluginsService,
      user,
    }
  }

  private readonly logger = new Logger(ChangesService.name)

  async create(change: BaseChange, user: DecodedJWT) {
    this.logger.log(`Change request: ${change.typeName} from ${user.email}`)

    const startTime = Date.now()
    const sequence = await this.db.transactional(async (scope) => {
      const seq = await scope.counter.getNextSequenceValue('changeCounter')
      const uniqUserId = `${user.email}-${seq}`
      const backend = this.buildServerDataStore(scope, uniqUserId)
      await change.execute(backend)
      return seq
    })
    this.logger.log(
      `Change executed in ${Date.now() - startTime}ms: ${change.typeName}`,
    )

    let geneId: string | undefined
    if (isFeatureChange(change)) {
      const rootFeatures = await this.db.feature.findRootParentsOfMany(
        change.changedIds,
      )
      if (rootFeatures.length > 0) {
        geneId = rootFeatures[0]._id
      }
      for (const rootFeature of rootFeatures) {
        await this.checksService.checkFeature(rootFeature._id)
      }
    }

    const changeDoc = await this.db.changeLog.create({
      assembly: isAssemblySpecificChange(change) ? change.assembly : undefined,
      geneId,
      typeName: change.typeName,
      changedIds: 'changedIds' in change ? (change.changedIds as string[]) : [],
      changes: 'changes' in change ? change.changes : {},
      user: user.email,
      sequence,
    })

    const userSessionId = makeUserSessionId(user)
    const assemblyId = isAssemblySpecificChange(change)
      ? change.assembly
      : undefined
    const message: ChangeMessage = {
      changeInfo: change.toJSON(),
      userName: user.username,
      userSessionId,
      channel: COMMON_CHANNEL,
      changeSequence: sequence,
      assemblyId,
    }
    if (assemblyId) {
      this.messagesGateway.emitToAssembly(assemblyId, COMMON_CHANNEL, message)
    } else {
      this.messagesGateway.broadcast(COMMON_CHANNEL, message)
    }
    return changeDoc
  }

  async findRecent(limit: number, offset: number) {
    return this.db.changeLog.findAll({
      sort: 'desc',
      limit,
      offset,
    })
  }

  async findByGeneId(geneId: string, limit: number, offset: number) {
    return this.db.changeLog.findAll({
      filter: { geneId },
      sort: 'desc',
      limit,
      offset,
    })
  }

  async countByGeneId(geneId: string) {
    return this.db.changeLog.countByGeneId(geneId)
  }

  async findAll(changeFilter: FindChangeDto) {
    this.logger.debug(`Search criteria: "${JSON.stringify(changeFilter)}"`)
    let changedIds: string[] | undefined
    if (changeFilter.featureId) {
      const descendants = await this.db.feature.findDescendants(
        changeFilter.featureId,
      )
      changedIds = [changeFilter.featureId]
      for (const d of descendants) {
        changedIds.push(d._id)
      }
    }
    return this.db.changeLog.findAll({
      filter: {
        assembly: changeFilter.assembly,
        geneId: changeFilter.geneId,
        user: changeFilter.user,
        typeName: changeFilter.typeName,
      },
      changedIds,
      sinceSequence: changeFilter.since
        ? Number(changeFilter.since)
        : undefined,
      sort: changeFilter.sort === '1' ? 'asc' : 'desc',
      limit: changeFilter.limit ? Number(changeFilter.limit) : undefined,
    })
  }
}
