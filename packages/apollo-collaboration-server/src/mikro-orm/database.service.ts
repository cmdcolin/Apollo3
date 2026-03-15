import type {
  AssemblyRepository,
  ChangeRepository,
  CheckRepository,
  CheckResultRepository,
  CounterRepository,
  FeatureRepository,
  FileRepository,
  JBrowseConfigRepository,
  OrganismRepository,
  RefSeqChunkRepository,
  RefSeqRepository,
  UserRepository,
} from '@apollo-annotation/common'
import {
  MikroOrmAssemblyRepository,
  MikroOrmChangeRepository,
  MikroOrmCheckRepository,
  MikroOrmCheckResultRepository,
  MikroOrmCounterRepository,
  MikroOrmFeatureRepository,
  MikroOrmFileRepository,
  MikroOrmJBrowseConfigRepository,
  MikroOrmOrganismRepository,
  MikroOrmRefSeqChunkRepository,
  MikroOrmRefSeqRepository,
  MikroOrmUserRepository,
  MongoFeatureRepository,
} from '@apollo-annotation/entities'
import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable } from '@nestjs/common'

export interface TransactionScope {
  assembly: AssemblyRepository
  organism: OrganismRepository
  feature: FeatureRepository
  refSeq: RefSeqRepository
  refSeqChunk: RefSeqChunkRepository
  checkConfig: CheckRepository
  check: CheckResultRepository
  file: FileRepository
  user: UserRepository
  jbrowseConfig: JBrowseConfigRepository
  counter: CounterRepository
}

function createFeatureRepository(em: EntityManager, dbType: string) {
  if (dbType === 'mongo') {
    return new MongoFeatureRepository(em)
  }
  return new MikroOrmFeatureRepository(em)
}

// Thin wrapper that constructs repository implementations from the injected
// EntityManager. With RequestContext middleware registered in main.ts, the EM
// is automatically request-scoped — each HTTP request gets its own identity
// map via AsyncLocalStorage, so no manual em.fork() is needed.
@Injectable()
export class DatabaseService {
  private readonly dbType: string

  constructor(@Inject(EntityManager) private readonly em: EntityManager) {
    this.dbType = process.env.DB_BACKEND ?? 'sqlite'
  }

  get assembly(): AssemblyRepository {
    return new MikroOrmAssemblyRepository(this.em)
  }

  get organism(): OrganismRepository {
    return new MikroOrmOrganismRepository(this.em)
  }

  get feature(): FeatureRepository {
    return createFeatureRepository(this.em, this.dbType)
  }

  get refSeq(): RefSeqRepository {
    return new MikroOrmRefSeqRepository(this.em)
  }

  get refSeqChunk(): RefSeqChunkRepository {
    return new MikroOrmRefSeqChunkRepository(this.em)
  }

  get user(): UserRepository {
    return new MikroOrmUserRepository(this.em)
  }

  get file(): FileRepository {
    return new MikroOrmFileRepository(this.em)
  }

  get check(): CheckResultRepository {
    return new MikroOrmCheckResultRepository(this.em)
  }

  get counter(): CounterRepository {
    return new MikroOrmCounterRepository(this.em)
  }

  get checkConfig(): CheckRepository {
    return new MikroOrmCheckRepository(this.em)
  }

  get jbrowseConfig(): JBrowseConfigRepository {
    return new MikroOrmJBrowseConfigRepository(this.em)
  }

  get changeLog(): ChangeRepository {
    return new MikroOrmChangeRepository(this.em)
  }

  // Runs a callback inside a database transaction. All repositories in the
  // callback share the same transactional EM so their writes are atomic.
  // Auto-commits on success, auto-rolls-back if the callback throws.
  async transactional<T>(callback: (scope: TransactionScope) => Promise<T>) {
    return this.em.transactional(async (txEm) => {
      return callback({
        assembly: new MikroOrmAssemblyRepository(txEm),
        organism: new MikroOrmOrganismRepository(txEm),
        feature: createFeatureRepository(txEm, this.dbType),
        refSeq: new MikroOrmRefSeqRepository(txEm),
        refSeqChunk: new MikroOrmRefSeqChunkRepository(txEm),
        checkConfig: new MikroOrmCheckRepository(txEm),
        check: new MikroOrmCheckResultRepository(txEm),
        file: new MikroOrmFileRepository(txEm),
        user: new MikroOrmUserRepository(txEm),
        jbrowseConfig: new MikroOrmJBrowseConfigRepository(txEm),
        counter: new MikroOrmCounterRepository(txEm),
      })
    })
  }
}
