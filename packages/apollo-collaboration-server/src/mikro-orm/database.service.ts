import type {
  AssemblyPermissionRepository,
  AssemblyRepository,
  BlastDbRepository,
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
  TextSearchAdapterConfigRepository,
  TrackConfigRepository,
  UserRepository,
} from '@apollo-annotation/common'
import {
  MikroOrmAssemblyPermissionRepository,
  MikroOrmAssemblyRepository,
  MikroOrmBlastDbRepository,
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
  MikroOrmTextSearchAdapterConfigRepository,
  MikroOrmTrackConfigRepository,
  MikroOrmUserRepository,
  MongoFeatureRepository,
} from '@apollo-annotation/entities'
import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable } from '@nestjs/common'

export interface TransactionScope {
  assembly: AssemblyRepository
  assemblyPermission: AssemblyPermissionRepository
  blastDb: BlastDbRepository
  organism: OrganismRepository
  feature: FeatureRepository
  refSeq: RefSeqRepository
  refSeqChunk: RefSeqChunkRepository
  checkConfig: CheckRepository
  check: CheckResultRepository
  file: FileRepository
  user: UserRepository
  jbrowseConfig: JBrowseConfigRepository
  trackConfig: TrackConfigRepository
  textSearchAdapterConfig: TextSearchAdapterConfigRepository
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

  // Cached repository instances. Safe to reuse because the injected EM uses
  // AsyncLocalStorage (via RequestContext middleware) for per-request isolation.
  readonly assembly: AssemblyRepository
  readonly assemblyPermission: AssemblyPermissionRepository
  readonly blastDb: BlastDbRepository
  readonly organism: OrganismRepository
  readonly feature: FeatureRepository
  readonly refSeq: RefSeqRepository
  readonly refSeqChunk: RefSeqChunkRepository
  readonly user: UserRepository
  readonly file: FileRepository
  readonly check: CheckResultRepository
  readonly counter: CounterRepository
  readonly checkConfig: CheckRepository
  readonly jbrowseConfig: JBrowseConfigRepository
  readonly trackConfig: TrackConfigRepository
  readonly textSearchAdapterConfig: TextSearchAdapterConfigRepository
  readonly changeLog: ChangeRepository

  constructor(@Inject(EntityManager) private readonly em: EntityManager) {
    this.dbType = process.env.DB_BACKEND ?? 'sqlite'
    this.assembly = new MikroOrmAssemblyRepository(em)
    this.assemblyPermission = new MikroOrmAssemblyPermissionRepository(em)
    this.blastDb = new MikroOrmBlastDbRepository(em)
    this.organism = new MikroOrmOrganismRepository(em)
    this.feature = createFeatureRepository(em, this.dbType)
    this.refSeq = new MikroOrmRefSeqRepository(em)
    this.refSeqChunk = new MikroOrmRefSeqChunkRepository(em)
    this.user = new MikroOrmUserRepository(em)
    this.file = new MikroOrmFileRepository(em)
    this.check = new MikroOrmCheckResultRepository(em)
    this.counter = new MikroOrmCounterRepository(em)
    this.checkConfig = new MikroOrmCheckRepository(em)
    this.jbrowseConfig = new MikroOrmJBrowseConfigRepository(em)
    this.trackConfig = new MikroOrmTrackConfigRepository(em)
    this.textSearchAdapterConfig =
      new MikroOrmTextSearchAdapterConfigRepository(em)
    this.changeLog = new MikroOrmChangeRepository(em)
  }

  // Runs a callback inside a database transaction. All repositories in the
  // callback share the same transactional EM so their writes are atomic.
  // Auto-commits on success, auto-rolls-back if the callback throws.
  async transactional<T>(callback: (scope: TransactionScope) => Promise<T>) {
    return this.em.transactional(async (txEm) => {
      return callback({
        assembly: new MikroOrmAssemblyRepository(txEm),
        assemblyPermission: new MikroOrmAssemblyPermissionRepository(txEm),
        blastDb: new MikroOrmBlastDbRepository(txEm),
        organism: new MikroOrmOrganismRepository(txEm),
        feature: createFeatureRepository(txEm, this.dbType),
        refSeq: new MikroOrmRefSeqRepository(txEm),
        refSeqChunk: new MikroOrmRefSeqChunkRepository(txEm),
        checkConfig: new MikroOrmCheckRepository(txEm),
        check: new MikroOrmCheckResultRepository(txEm),
        file: new MikroOrmFileRepository(txEm),
        user: new MikroOrmUserRepository(txEm),
        jbrowseConfig: new MikroOrmJBrowseConfigRepository(txEm),
        trackConfig: new MikroOrmTrackConfigRepository(txEm),
        textSearchAdapterConfig: new MikroOrmTextSearchAdapterConfigRepository(
          txEm,
        ),
        counter: new MikroOrmCounterRepository(txEm),
      })
    })
  }
}
