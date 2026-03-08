import {
  Operation,
  type ServerDataStoreV2,
  operationRegistry,
} from '@apollo-annotation/common'
import { Injectable, Logger } from '@nestjs/common'

import { CountersService } from '../counters/counters.service'
import { FilesService } from '../files/files.service'
import { DatabaseService } from '../mikro-orm/database.service'
import { PluginsService } from '../plugins/plugins.service'

@Injectable()
export class OperationsService {
  constructor(
    private readonly filesService: FilesService,
    private readonly countersService: CountersService,
    private readonly pluginsService: PluginsService,
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
  ) {
    const { logger } = this
    const OperationType = operationRegistry.getOperationType(
      serializedOperation.typeName,
    )
    const operation = new OperationType(serializedOperation, { logger })

    const v2Backend = this.buildServerDataStoreV2()
    return (await operation.execute(v2Backend)) as ReturnType<
      T['executeOnServer']
    >
  }
}
