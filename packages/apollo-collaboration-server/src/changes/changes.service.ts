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

import { CountersService } from '../counters/counters.service.js'
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
    private readonly countersService: CountersService,
    private readonly pluginsService: PluginsService,
    private readonly messagesGateway: MessagesGateway,
    private readonly db: DatabaseService,
  ) {}

  private buildServerDataStore(user: string): ServerDataStore {
    const uow = this.db.createUnitOfWork()
    return {
      typeName: 'Server',
      featureRepository: uow.feature,
      assemblyRepository: uow.assembly,
      refSeqRepository: uow.refSeq,
      refSeqChunkRepository: uow.refSeqChunk,
      checkRepository: uow.checkConfig,
      checkResultRepository: uow.check,
      fileRepository: uow.file,
      userRepository: uow.user,
      jbrowseConfigRepository: uow.jbrowseConfig,
      unitOfWork: uow.unitOfWork,
      filesService: {
        getFileStream: (file) => this.filesService.getFileStream(file),
        getFileHandle: (file) => this.filesService.getFileHandle(file),
        getDecompressedFileContents: (file) =>
          this.filesService.getDecompressedFileContents(file),
        parseGFF3: (stream) => this.filesService.parseGFF3(stream),
        create: (dto) => {
          void this.filesService.create(dto)
        },
        remove: (id) => {
          void this.filesService.remove(id)
        },
      },
      pluginsService: this.pluginsService,
      counterService: this.countersService,
      user,
    }
  }

  private readonly logger = new Logger(ChangesService.name)

  async create(change: BaseChange, user: DecodedJWT) {
    this.logger.debug(`Requested change: ${JSON.stringify(change)}`)

    const sequence =
      await this.countersService.getNextSequenceValue('changeCounter')
    const uniqUserId = `${user.email}-${sequence}`

    const validationResult = await validationRegistry.backendPreValidate(change)
    if (!validationResult.ok) {
      const errorMessage = validationResult.resultsMessages
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

    const backend = this.buildServerDataStore(uniqUserId)
    try {
      await change.execute(backend)
      await backend.unitOfWork.commit()
    } catch (error) {
      await backend.unitOfWork.rollback()
      throw new UnprocessableEntityException(String(error))
    }

    const changeDoc = await this.db.changeLog.create({
      assembly: isAssemblySpecificChange(change) ? change.assembly : undefined,
      typeName: change.typeName,
      changedIds: 'changedIds' in change ? (change.changedIds as string[]) : [],
      changes: 'changes' in change ? change.changes : {},
      user: user.email,
      sequence,
    })

    if (STATUS_ZERO_CHANGE_TYPES.has(change.typeName)) {
      this.logger.debug('Activating temporary documents')
      await this.db.assembly.activateByUser(uniqUserId)
      await this.db.refSeqChunk.activateByUser(uniqUserId)
      await this.db.feature.activateByUser(uniqUserId)
      await this.db.refSeq.activateByUser(uniqUserId)
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
