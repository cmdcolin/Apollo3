import {
  Operation,
  type ServerDataStoreV2,
  operationRegistry,
} from '@apollo-annotation/common'
import {
  MikroOrmAssemblyRepository,
  MikroOrmCheckRepository,
  MikroOrmCheckResultRepository,
  MikroOrmFeatureRepository,
  MikroOrmFileRepository,
  MikroOrmJBrowseConfigRepository,
  MikroOrmRefSeqChunkRepository,
  MikroOrmRefSeqRepository,
  MikroOrmUserRepository,
} from '@apollo-annotation/entities'
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
import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { InjectConnection, InjectModel } from '@nestjs/mongoose'
import { Connection, Model } from 'mongoose'

import { CountersService } from '../counters/counters.service'
import { FilesService } from '../files/files.service'
import { PluginsService } from '../plugins/plugins.service'

@Injectable()
export class OperationsService {
  constructor(
    @InjectModel(Assembly.name)
    private readonly assemblyModel: Model<AssemblyDocument>,
    @InjectModel(User.name)
    private readonly userModel: Model<UserDocument>,
    @InjectModel(JBrowseConfig.name)
    private readonly jbrowseConfigModel: Model<JBrowseConfigDocument>,
    @InjectModel(Feature.name)
    private readonly featureModel: Model<FeatureDocument>,
    @InjectModel(File.name)
    private readonly fileModel: Model<FileDocument>,
    @InjectModel(RefSeq.name)
    private readonly refSeqModel: Model<RefSeqDocument>,
    @InjectModel(RefSeqChunk.name)
    private readonly refSeqChunkModel: Model<RefSeqChunkDocument>,
    @InjectModel(Check.name)
    private readonly checkModel: Model<CheckDocument>,
    private readonly filesService: FilesService,
    private readonly countersService: CountersService,
    private readonly pluginsService: PluginsService,
    @InjectConnection() private connection: Connection,
    @Optional() @Inject(EntityManager) private readonly em?: EntityManager,
  ) {}

  private get useV2Backend() {
    const dbBackend = process.env.DB_BACKEND
    return dbBackend && dbBackend !== 'mongodb' && this.em !== undefined
  }

  private buildServerDataStoreV2(): ServerDataStoreV2 {
    if (!this.em) {
      throw new Error('EntityManager not available')
    }
    const em = this.em.fork()
    return {
      typeName: 'ServerV2',
      featureRepository: new MikroOrmFeatureRepository(em),
      assemblyRepository: new MikroOrmAssemblyRepository(em),
      refSeqRepository: new MikroOrmRefSeqRepository(em),
      refSeqChunkRepository: new MikroOrmRefSeqChunkRepository(em),
      checkRepository: new MikroOrmCheckRepository(em),
      checkResultRepository: new MikroOrmCheckResultRepository(em),
      fileRepository: new MikroOrmFileRepository(em),
      userRepository: new MikroOrmUserRepository(em),
      jbrowseConfigRepository: new MikroOrmJBrowseConfigRepository(em),
      unitOfWork: {
        async commit() {
          await em.flush()
        },
        rollback() {
          em.clear()
          return Promise.resolve()
        },
      },
      filesService: this.buildV2FilesService(),
      pluginsService: this.pluginsService,
      counterService: this.countersService,
      user: '',
    }
  }

  private buildV2FilesService(): ServerDataStoreV2['filesService'] {
    return {
      getFileStream: (file) => this.filesService.getFileStream(file),
      getFileHandle: (file) => this.filesService.getFileHandle(file),
      parseGFF3: (stream) => this.filesService.parseGFF3(stream),
      create: (dto) => {
        void this.filesService.create(dto)
      },
      remove: (id) => {
        void this.filesService.remove(id)
      },
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

    if (this.useV2Backend) {
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
