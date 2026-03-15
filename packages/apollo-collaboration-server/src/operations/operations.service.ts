import {
  Operation,
  type ServerDataStore,
  operationRegistry,
} from '@apollo-annotation/common'
import { Injectable, Logger } from '@nestjs/common'

import { FilesService } from '../files/files.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { PluginsService } from '../plugins/plugins.service.js'

@Injectable()
export class OperationsService {
  constructor(
    private readonly filesService: FilesService,
    private readonly pluginsService: PluginsService,
    private readonly db: DatabaseService,
  ) {}

  private buildServerDataStore(
    scope: import('../mikro-orm/database.service.js').TransactionScope,
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

    return this.db.transactional(async (scope) => {
      const backend = this.buildServerDataStore(scope)
      return (await operation.execute(backend)) as ReturnType<
        T['executeOnServer']
      >
    })
  }
}
