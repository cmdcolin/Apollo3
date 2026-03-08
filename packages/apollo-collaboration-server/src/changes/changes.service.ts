/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  Change as BaseChange,
  type ServerDataStoreV2,
  isAssemblySpecificChange,
  isFeatureChange,
} from '@apollo-annotation/common'
import {
  Assembly,
  AssemblyDocument,
  Change,
  ChangeDocument,
  Check,
  CheckDocument,
  Feature,
  FeatureDocument,
  File,
  FileDocument,
  JBrowseConfig,
  JBrowseConfigDocument,
  RefSeq,
  RefSeqChunk,
  RefSeqChunkDocument,
  RefSeqDocument,
  User,
  UserDocument,
} from '@apollo-annotation/schemas'
import {
  AddFeatureChange,
  AddFeatureChangeDetails,
  ChangeMessage,
  DecodedJWT,
  makeUserSessionId,
  validationRegistry,
} from '@apollo-annotation/shared'
import {
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Model } from 'mongoose'

import { CountersService } from '../counters/counters.service'
import { FilesService } from '../files/files.service'
import { MessagesGateway } from '../messages/messages.gateway'
import { DatabaseService } from '../mikro-orm/database.service'
import { PluginsService } from '../plugins/plugins.service'

import { FindChangeDto } from './dto/find-change.dto'

const STATUS_ZERO_CHANGE_TYPES = new Set([
  'AddAssemblyAndFeaturesFromFileChange',
  'AddAssemblyFromExternalChange',
  'AddAssemblyFromFileChange',
  'AddFeaturesFromFileChange',
])

export class ChangesService {
  constructor(
    @Optional()
    @InjectModel(Feature.name)
    private readonly featureModel: Model<FeatureDocument>,
    @Optional()
    @InjectModel(Assembly.name)
    private readonly assemblyModel: Model<AssemblyDocument>,
    @Optional()
    @InjectModel(RefSeq.name)
    private readonly refSeqModel: Model<RefSeqDocument>,
    @Optional()
    @InjectModel(RefSeqChunk.name)
    private readonly refSeqChunkModel: Model<RefSeqChunkDocument>,
    @Optional()
    @InjectModel(File.name)
    private readonly fileModel: Model<FileDocument>,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @Optional()
    @InjectModel(JBrowseConfig.name)
    private readonly jbrowseConfigModel: Model<JBrowseConfigDocument>,
    @Optional()
    @InjectModel(Change.name)
    private readonly changeModel: Model<ChangeDocument>,
    @Optional()
    @InjectModel(Check.name)
    private readonly checkModel: Model<CheckDocument>,
    private readonly filesService: FilesService,
    private readonly countersService: CountersService,
    private readonly pluginsService: PluginsService,
    private readonly messagesGateway: MessagesGateway,
    private readonly db: DatabaseService,
  ) {}

  private buildServerDataStoreV2(user: string): ServerDataStoreV2 {
    const uow = this.db.createUnitOfWork()
    return {
      typeName: 'ServerV2',
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
    const uniqUserId = `${user.email}-${sequence}` // Same user can upload data from more than one client

    const validationResult = await validationRegistry.backendPreValidate(change)
    if (!validationResult.ok) {
      const errorMessage = validationResult.resultsMessages
      throw new UnprocessableEntityException(
        `Error in backend pre-validation: ${errorMessage}`,
      )
    }
    // Get some info for later broadcasting, before any features are potentially
    // deleted
    const refNames: string[] = []
    if (isFeatureChange(change)) {
      const { changedIds } = change
      if (this.db.useV2Backend) {
        for (const changedId of changedIds) {
          const features = await this.db.feature.findByIds([changedId])
          if (features.length > 0) {
            const refSeq = await this.db.refSeq.findById(features[0].refSeq)
            if (refSeq) {
              refNames.push(refSeq.name)
            }
          }
        }
      } else {
        for (const changedId of changedIds) {
          const featureDoc = await this.featureModel
            .findOne({ allIds: changedId })
            .exec()
          if (featureDoc) {
            const refSeqDoc = await this.refSeqModel
              .findById(featureDoc.refSeq)
              .exec()
            if (refSeqDoc) {
              refNames.push(refSeqDoc.name)
            }
          }
        }
      }
    }

    if (this.db.useV2Backend) {
      const v2Backend = this.buildServerDataStoreV2(uniqUserId)
      try {
        await change.execute(v2Backend)
        await v2Backend.unitOfWork.commit()
      } catch (error) {
        await v2Backend.unitOfWork.rollback()
        throw new UnprocessableEntityException(String(error))
      }

      const changeDoc = await this.db.changeLog.create({
        assembly: isAssemblySpecificChange(change)
          ? change.assembly
          : undefined,
        typeName: change.typeName,
        changedIds:
          'changedIds' in change ? (change.changedIds as string[]) : [],
        changes: 'changes' in change ? change.changes : {},
        user: user.email,
        sequence,
      })

      if (STATUS_ZERO_CHANGE_TYPES.has(change.typeName)) {
        this.logger.debug('Activating temporary documents for v2 backend')
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

    let changeDoc: ChangeDocument | undefined
    await this.featureModel.db.transaction(async (session) => {
      try {
        await change.execute({
          typeName: 'Server',
          featureModel: this.featureModel,
          assemblyModel: this.assemblyModel,
          refSeqModel: this.refSeqModel,
          refSeqChunkModel: this.refSeqChunkModel,
          fileModel: this.fileModel,
          userModel: this.userModel,
          jbrowseConfigModel: this.jbrowseConfigModel,
          checkModel: this.checkModel,
          session,
          filesService: this.filesService,
          counterService: this.countersService,
          pluginsService: this.pluginsService,
          user: uniqUserId,
        })
      } catch (error) {
        // Clean up old "temporary document" -documents
        // We cannot use Mongo 'session' / transaction here because Mongo has 16 MB limit for transaction
        this.logger.debug(
          '*** INSERT DATA EXCEPTION - Start to clean up old temporary documents...',
        )
        await this.assemblyModel.deleteMany({
          $and: [{ status: -1, user: uniqUserId }],
        })
        await this.featureModel.deleteMany({
          $and: [{ status: -1, user: uniqUserId }],
        })
        await this.refSeqModel.deleteMany({
          $and: [{ status: -1, user: uniqUserId }],
        })
        await this.refSeqChunkModel.deleteMany({
          $and: [{ status: -1, user: uniqUserId }],
        })
        throw new UnprocessableEntityException(String(error))
      }

      // Add entry to change collection
      const [savedChangedLogDoc] = await this.changeModel.create([
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        { ...change, user: user.email, sequence },
      ])
      changeDoc = savedChangedLogDoc
      const validationResult2 = await validationRegistry.backendPostValidate(
        change,
        { featureModel: this.featureModel, session },
      )
      if (!validationResult2.ok) {
        const errorMessage = validationResult2.resultsMessages
        throw new UnprocessableEntityException(
          `Error in backend post-validation: ${errorMessage}`,
        )
      }
    })

    // TODO: temporary solution to set status of add feature change to 0
    if (change.typeName === 'AddFeatureChange') {
      const addFeatureChange = change as AddFeatureChange
      const addFeatureChangeDetails: AddFeatureChangeDetails[] =
        addFeatureChange.changes
      for (const addFeatureChangeDetail of addFeatureChangeDetails) {
        const { addedFeature } = addFeatureChangeDetail

        await this.featureModel.db.transaction(async () => {
          try {
            await this.featureModel.updateMany(
              {
                $and: [{ status: -1, user: uniqUserId, _id: addedFeature._id }],
              },
              { $set: { status: 0 } },
            )
          } catch (error) {
            const err = error as Error
            this.logger.error(
              `Error setting status of add feature change to 0: ${err.message}`,
            )
            await this.featureModel.deleteMany({
              $and: [{ status: -1, user: uniqUserId, _id: addedFeature._id }],
            })
          }
        })
      }
    }

    if (STATUS_ZERO_CHANGE_TYPES.has(change.typeName)) {
      this.logger.debug?.('*** TEMPORARY DATA INSERTTED ***')
      // Set "temporary document" -status --> "valid" -status i.e. (-1 --> 0)
      await this.featureModel.db.transaction(async () => {
        this.logger.debug(
          'Updates "temporary document" -status --> "valid" -status',
        )
        try {
          // We cannot use Mongo 'session' / transaction here because Mongo has 16 MB limit for transaction
          await this.assemblyModel.updateMany(
            { $and: [{ status: -1, user: uniqUserId }] },
            { $set: { status: 0 } },
          )
          await this.refSeqChunkModel.updateMany(
            { $and: [{ status: -1, user: uniqUserId }] },
            { $set: { status: 0 } },
          )
          await this.featureModel.updateMany(
            { $and: [{ status: -1, user: uniqUserId }] },
            { $set: { status: 0 } },
          )
          await this.refSeqModel.updateMany(
            { $and: [{ status: -1, user: uniqUserId }] },
            { $set: { status: 0 } },
          )
        } catch (error) {
          // Clean up old "temporary document" -documents
          this.logger.debug(
            '*** UPDATE STATUS EXCEPTION - Start to clean up old temporary documents...',
          )
          // We cannot use Mongo 'session' / transaction here because Mongo has 16 MB limit for transaction
          await this.assemblyModel.deleteMany({
            $and: [{ status: -1, user: uniqUserId }],
          })
          await this.featureModel.deleteMany({
            $and: [{ status: -1, user: uniqUserId }],
          })
          await this.refSeqModel.deleteMany({
            $and: [{ status: -1, user: uniqUserId }],
          })
          await this.refSeqChunkModel.deleteMany({
            $and: [{ status: -1, user: uniqUserId }],
          })
          throw new UnprocessableEntityException(String(error))
        }
      })
    }

    this.logger.debug?.(`CHANGE DOC: ${JSON.stringify(changeDoc)}`)
    if (!changeDoc) {
      throw new UnprocessableEntityException('could not create change')
    }
    this.logger.debug(`TypeName: ${change.typeName}`)

    if (!isAssemblySpecificChange(change)) {
      return
    }

    // Broadcast
    const messages: ChangeMessage[] = []

    const userSessionId = makeUserSessionId(user)
    if (isFeatureChange(change)) {
      for (const refName of refNames) {
        messages.push({
          changeInfo: change.toJSON(),
          userName: user.username,
          userSessionId,
          channel: `${change.assembly}-${refName}`,
          changeSequence: changeDoc.sequence,
        })
      }
    } else {
      messages.push({
        changeInfo: change.toJSON(),
        userName: user.username,
        userSessionId,
        channel: 'COMMON',
        changeSequence: changeDoc.sequence,
      })
    }

    for (const message of messages) {
      this.logger.debug(
        `Broadcasting to channels '${
          message.channel
        }', changeObject: "${JSON.stringify(message)}"`,
      )
      await this.messagesGateway.create(message.channel, message)
    }
    this.logger.debug(`ChangeDocId: ${changeDoc?._id}`)
    return changeDoc
  }

  async findAll(changeFilter: FindChangeDto) {
    this.logger.debug(`Search criteria: "${JSON.stringify(changeFilter)}"`)

    if (this.db.useV2Backend) {
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

    // eslint-disable-next-line @typescript-eslint/no-misused-spread
    const queryCond: FilterQuery<ChangeDocument> = { ...changeFilter }
    if (changeFilter.user) {
      queryCond.user = { $regex: changeFilter.user, $options: 'i' }
    }
    if (changeFilter.since) {
      queryCond.sequence = { $gt: Number(changeFilter.since) }
      delete queryCond.since
    }

    let sortOrder: 1 | -1 = -1
    if (changeFilter.sort && changeFilter.sort === '1') {
      sortOrder = 1
    }
    let changeCursor = this.changeModel
      // unicorn thinks this is an Array.prototype.find, so we ignore it
      // eslint-disable-next-line unicorn/no-array-callback-reference
      .find(queryCond)
      .sort({ sequence: sortOrder })

    if (changeFilter.limit) {
      changeCursor = changeCursor.limit(Number(changeFilter.limit))
    }
    const change = await changeCursor.exec()

    if (!change) {
      const errMsg = 'ERROR: The following change was not found in database....'
      this.logger.error(errMsg)
      throw new NotFoundException(errMsg)
    }

    return change
  }
}
