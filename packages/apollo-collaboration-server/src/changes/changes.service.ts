import {
  Change as BaseChange,
  type ServerDataStore,
  isAssemblySpecificChange,
  isFeatureChange,
} from '@apollo-annotation/common'
import {
  type ChangeMessage,
  type DecodedJWT,
  makeUserSessionId,
  validationRegistry,
} from '@apollo-annotation/shared'
import {
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common'

import { ChecksService } from '../checks/checks.service.js'
import { FilesService } from '../files/files.service.js'
import { MessagesGateway } from '../messages/messages.gateway.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { PluginsService } from '../plugins/plugins.service.js'

import { FindChangeDto } from './dto/find-change.dto.js'

const STATUS_ZERO_CHANGE_TYPES = new Set([
  'AddAssemblyAndFeaturesFromFileChange',
  'AddAssemblyFromFileChange',
  'AddFeaturesFromFileChange',
])

@Injectable()
export class ChangesService {
  constructor(
    private readonly filesService: FilesService,
    private readonly pluginsService: PluginsService,
    private readonly messagesGateway: MessagesGateway,
    private readonly db: DatabaseService,
    private readonly checksService: ChecksService,
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
      filesService: {
        getFileStream: (file) => this.filesService.getFileStream(file),
        getFileHandle: (file) => this.filesService.getFileHandle(file),
        getDecompressedFileContents: (file) =>
          this.filesService.getDecompressedFileContents(file),
        parseGFF3: (stream) => this.filesService.parseGFF3(stream),
      },
      pluginsService: this.pluginsService,
      user,
    }
  }

  private readonly logger = new Logger(ChangesService.name)

  async create(change: BaseChange, user: DecodedJWT) {
    this.logger.log(`Change request: ${change.typeName} from ${user.email}`)

    const validationResult = await validationRegistry.backendPreValidate(change)
    if (!validationResult.ok) {
      const errorMessage = validationResult.resultsMessages
      this.logger.error(`Pre-validation failed: ${errorMessage}`)
      throw new UnprocessableEntityException(
        `Error in backend pre-validation: ${errorMessage}`,
      )
    }

    const refNames: string[] = []
    if (isFeatureChange(change)) {
      const { changedIds } = change
      for (const changedId of changedIds) {
        const features = await this.db.feature.findByIds([changedId])
        if (features.length > 0) {
          const firstFeature = features[0]
          const refSeq = firstFeature
            ? await this.db.refSeq.findById(firstFeature.refSeq)
            : undefined
          if (refSeq) {
            refNames.push(refSeq.name)
          }
        }
      }
    }

    const startTime = Date.now()
    const sequence = await this.db.transactional(async (scope) => {
      const seq =
        await scope.counter.getNextSequenceValue('changeCounter')
      const uniqUserId = `${user.email}-${seq}`
      const backend = this.buildServerDataStore(scope, uniqUserId)
      await change.execute(backend)

      if (STATUS_ZERO_CHANGE_TYPES.has(change.typeName)) {
        await scope.assembly.activateByUser(uniqUserId)
        await scope.refSeqChunk.activateByUser(uniqUserId)
        await scope.feature.activateByUser(uniqUserId)
        await scope.refSeq.activateByUser(uniqUserId)
      }
      return seq
    })
    this.logger.log(`Change executed in ${Date.now() - startTime}ms: ${change.typeName}`)

    const changeDoc = await this.db.changeLog.create({
      assembly: isAssemblySpecificChange(change) ? change.assembly : undefined,
      typeName: change.typeName,
      changedIds: 'changedIds' in change ? (change.changedIds as string[]) : [],
      changes: 'changes' in change ? change.changes : {},
      user: user.email,
      sequence,
    })

    if (isFeatureChange(change)) {
      const checkedRootIds = new Set<string>()
      for (const changedId of change.changedIds) {
        const rootFeature = await this.db.feature.findRootParent(changedId)
        if (rootFeature && !checkedRootIds.has(rootFeature._id)) {
          checkedRootIds.add(rootFeature._id)
          await this.checksService.checkFeature(rootFeature._id)
        }
      }
    }

    if (isAssemblySpecificChange(change)) {
      const messages: ChangeMessage[] = []
      const userSessionId = makeUserSessionId(user)
      if (isFeatureChange(change)) {
        for (const refName of refNames) {
          messages.push({
            changeInfo: change.toJSON(),
            userName: user.username,
            userSessionId,
            channel: `${change.assembly}-${refName}`,
            changeSequence: sequence,
          })
        }
      } else {
        messages.push({
          changeInfo: change.toJSON(),
          userName: user.username,
          userSessionId,
          channel: 'COMMON',
          changeSequence: sequence,
        })
      }
      for (const message of messages) {
        await this.messagesGateway.create(message.channel, message)
      }
    }
    return changeDoc
  }

  async findAll(changeFilter: FindChangeDto) {
    this.logger.debug(`Search criteria: "${JSON.stringify(changeFilter)}"`)
    return this.db.changeLog.findAll({
      filter: {
        assembly: changeFilter.assembly,
        user: changeFilter.user,
        typeName: changeFilter.typeName,
      },
      sinceSequence: changeFilter.since
        ? Number(changeFilter.since)
        : undefined,
      sort: changeFilter.sort === '1' ? 'asc' : 'desc',
      limit: changeFilter.limit ? Number(changeFilter.limit) : undefined,
    })
  }
}
