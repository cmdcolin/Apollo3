import {
  Change as BaseChange,
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
import { Inject, Injectable, Logger } from '@nestjs/common'

import { ChecksService } from '../checks/checks.service.js'
import { FilesService } from '../files/files.service.js'
import { MessagesGateway } from '../messages/messages.gateway.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { PluginsService } from '../plugins/plugins.service.js'

import { FindChangeDto } from './dto/find-change.dto.js'

@Injectable()
export class ChangesService {
  constructor(
    @Inject(FilesService) private readonly filesService: FilesService,
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
      refSeqChunkRepository: scope.refSeqChunk,
      checkRepository: scope.checkConfig,
      checkResultRepository: scope.check,
      fileRepository: scope.file,
      userRepository: scope.user,
      jbrowseConfigRepository: scope.jbrowseConfig,
      filesService: this.filesService,
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

    const changeDoc = await this.db.changeLog.create({
      assembly: isAssemblySpecificChange(change) ? change.assembly : undefined,
      typeName: change.typeName,
      changedIds: 'changedIds' in change ? (change.changedIds as string[]) : [],
      changes: 'changes' in change ? change.changes : {},
      user: user.email,
      sequence,
    })

    if (isFeatureChange(change)) {
      const rootFeatures = await this.db.feature.findRootParentsOfMany(
        change.changedIds,
      )
      for (const rootFeature of rootFeatures) {
        await this.checksService.checkFeature(rootFeature._id)
      }
    }

    const userSessionId = makeUserSessionId(user)
    await this.messagesGateway.create(COMMON_CHANNEL, {
      changeInfo: change.toJSON(),
      userName: user.username,
      userSessionId,
      channel: COMMON_CHANNEL,
      changeSequence: sequence,
    })
    return changeDoc
  }

  async findRecent(limit: number, offset: number) {
    return this.db.changeLog.findAll({
      sort: 'desc',
      limit,
      offset,
    })
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
