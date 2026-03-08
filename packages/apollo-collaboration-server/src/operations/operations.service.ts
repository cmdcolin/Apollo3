import {
  Operation,
  type ServerDataStoreV2,
  operationRegistry,
} from '@apollo-annotation/common'
import {
  Assembly,
  AssemblyDocument,
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
import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { Connection, Model } from 'mongoose'

import { CountersService } from '../counters/counters.service'
import { FilesService } from '../files/files.service'
import { DatabaseService } from '../mikro-orm/database.service'
import { PluginsService } from '../plugins/plugins.service'

@Injectable()
export class OperationsService {
  constructor(
    @Optional()
    @InjectModel(Assembly.name)
    private readonly assemblyModel: Model<AssemblyDocument>,
    @Optional()
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @Optional()
    @InjectModel(JBrowseConfig.name)
    private readonly jbrowseConfigModel: Model<JBrowseConfigDocument>,
    @Optional()
    @InjectModel(Feature.name)
    private readonly featureModel: Model<FeatureDocument>,
    @Optional()
    @InjectModel(File.name)
    private readonly fileModel: Model<FileDocument>,
    @Optional()
    @InjectModel(RefSeq.name)
    private readonly refSeqModel: Model<RefSeqDocument>,
    @Optional()
    @InjectModel(RefSeqChunk.name)
    private readonly refSeqChunkModel: Model<RefSeqChunkDocument>,
    @Optional()
    @InjectModel(Check.name)
    private readonly checkModel: Model<CheckDocument>,
    private readonly filesService: FilesService,
    private readonly countersService: CountersService,
    private readonly pluginsService: PluginsService,
    @Optional() @InjectConnection() private connection: Connection,
    private readonly db: DatabaseService,
  ) {}

  private buildServerDataStoreV2(): ServerDataStoreV2 {
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
      user: '',
    }
  }

  private readonly logger = new Logger(OperationsService.name)

  async executeOperation<T extends Operation>(
    serializedOperation: ReturnType<T['toJSON']>,
  ): Promise<ReturnType<T['executeOnServer']>> {
    const { logger } = this
    const OperationType = operationRegistry.getOperationType(
      serializedOperation.typeName,
    )
    const operation = new OperationType(serializedOperation, { logger })

    if (this.db.useV2Backend) {
      const v2Backend = this.buildServerDataStoreV2()
      return (await operation.execute(v2Backend)) as ReturnType<
        T['executeOnServer']
      >
    }

    const {
      assemblyModel,
      checkModel,
      connection,
      countersService,
      featureModel,
      fileModel,
      filesService,
      jbrowseConfigModel,
      pluginsService,
      refSeqChunkModel,
      refSeqModel,
      userModel,
    } = this
    const session = await connection.startSession()
    const result = (await operation.execute({
      typeName: 'Server',
      featureModel,
      assemblyModel,
      refSeqModel,
      refSeqChunkModel,
      fileModel,
      userModel,
      jbrowseConfigModel,
      checkModel,
      session,
      filesService,
      counterService: countersService,
      pluginsService,
      user: '',
    })) as ReturnType<T['executeOnServer']>
    await session.endSession()
    return result
  }
}
