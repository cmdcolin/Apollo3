import type {
  AssemblyRepository,
  ChangeRepository,
  CheckRepository,
  CheckResultRepository,
  CounterRepository,
  FeatureRepository,
  FileRepository,
  JBrowseConfigRepository,
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
  MikroOrmRefSeqChunkRepository,
  MikroOrmRefSeqRepository,
  MikroOrmUserRepository,
} from '@apollo-annotation/entities'
import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable } from '@nestjs/common'

export interface TransactionScope {
  assembly: AssemblyRepository
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

// Provides repository access to the database. Each getter creates an isolated
// EntityManager (via em.fork()) so that reads don't share identity-map state
// between callers. For writes that need atomicity, use transactional().
@Injectable()
export class DatabaseService {
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {}

  // em.fork() creates a lightweight copy of the EntityManager with its own
  // identity map but sharing the same connection pool. This prevents one
  // caller's loaded entities from leaking into another caller's queries.
  private fork() {
    return this.em.fork()
  }

  get assembly(): AssemblyRepository {
    return new MikroOrmAssemblyRepository(this.fork())
  }

  get feature(): FeatureRepository {
    return new MikroOrmFeatureRepository(this.fork())
  }

  get refSeq(): RefSeqRepository {
    return new MikroOrmRefSeqRepository(this.fork())
  }

  get refSeqChunk(): RefSeqChunkRepository {
    return new MikroOrmRefSeqChunkRepository(this.fork())
  }

  get user(): UserRepository {
    return new MikroOrmUserRepository(this.fork())
  }

  get file(): FileRepository {
    return new MikroOrmFileRepository(this.fork())
  }

  get check(): CheckResultRepository {
    return new MikroOrmCheckResultRepository(this.fork())
  }

  get counter(): CounterRepository {
    return new MikroOrmCounterRepository(this.fork())
  }

  get checkConfig(): CheckRepository {
    return new MikroOrmCheckRepository(this.fork())
  }

  get jbrowseConfig(): JBrowseConfigRepository {
    return new MikroOrmJBrowseConfigRepository(this.fork())
  }

  get changeLog(): ChangeRepository {
    return new MikroOrmChangeRepository(this.fork())
  }

  // Runs a callback inside a database transaction. MikroORM's transactional()
  // creates a forked EntityManager, wraps all operations in BEGIN/COMMIT, and
  // automatically rolls back on error. All repositories in the callback share
  // the same transactional EM so their writes are atomic.
  async transactional<T>(callback: (scope: TransactionScope) => Promise<T>) {
    return this.em.transactional(async (txEm) => {
      return callback({
        assembly: new MikroOrmAssemblyRepository(txEm),
        feature: new MikroOrmFeatureRepository(txEm),
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
