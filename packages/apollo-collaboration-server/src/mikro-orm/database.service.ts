import type {
  AssemblyRepository,
  CheckRepository,
  CheckResultRepository,
  CounterRepository,
  FeatureRepository,
  FileRepository,
  JBrowseConfigRepository,
  RefSeqChunkRepository,
  RefSeqRepository,
  UnitOfWork,
  UserRepository,
} from '@apollo-annotation/common'
import {
  MikroOrmAssemblyRepository,
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
import { Inject, Injectable, Optional } from '@nestjs/common'

@Injectable()
export class DatabaseService {
  constructor(
    @Optional() @Inject(EntityManager) private readonly em?: EntityManager,
  ) {}

  get useV2Backend() {
    const dbBackend = process.env.DB_BACKEND
    return dbBackend && dbBackend !== 'mongodb' && this.em !== undefined
  }

  private fork() {
    if (!this.em) {
      throw new Error('EntityManager not available')
    }
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

  createUnitOfWork() {
    const em = this.fork()
    return {
      assembly: new MikroOrmAssemblyRepository(em) as AssemblyRepository,
      feature: new MikroOrmFeatureRepository(em) as FeatureRepository,
      refSeq: new MikroOrmRefSeqRepository(em) as RefSeqRepository,
      refSeqChunk: new MikroOrmRefSeqChunkRepository(
        em,
      ) as RefSeqChunkRepository,
      checkConfig: new MikroOrmCheckRepository(em) as CheckRepository,
      check: new MikroOrmCheckResultRepository(em) as CheckResultRepository,
      file: new MikroOrmFileRepository(em) as FileRepository,
      user: new MikroOrmUserRepository(em) as UserRepository,
      jbrowseConfig: new MikroOrmJBrowseConfigRepository(
        em,
      ) as JBrowseConfigRepository,
      unitOfWork: {
        async commit() {
          await em.flush()
        },
        rollback() {
          em.clear()
          return Promise.resolve()
        },
      } satisfies UnitOfWork,
    }
  }
}
