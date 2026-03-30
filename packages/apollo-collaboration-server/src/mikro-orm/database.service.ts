import type {
  AnalysisDbRepository,
  AnalysisJobRepository,
  AssemblyPermissionRepository,
  AssemblyRepository,
  CheckRepository,
  CheckResultRepository,
  CounterRepository,
  FeatureRepository,
  FileRepository,
  OrganismRepository,
  RefSeqRepository,
  TextSearchAdapterConfigRepository,
  TrackConfigRepository,
  UserRepository,
} from '@apollo-annotation/common'
import {
  MikroOrmAnalysisDbRepository,
  MikroOrmAnalysisJobRepository,
  MikroOrmAssemblyPermissionRepository,
  MikroOrmAssemblyRepository,
  MikroOrmCheckRepository,
  MikroOrmCheckResultRepository,
  MikroOrmCounterRepository,
  MikroOrmFeatureRepository,
  MikroOrmFileRepository,
  MikroOrmOrganismRepository,
  MikroOrmRefSeqRepository,
  MikroOrmTextSearchAdapterConfigRepository,
  MikroOrmTrackConfigRepository,
  MikroOrmUserRepository,
  MongoFeatureRepository,
  RefSeqEntity,
} from '@apollo-annotation/entities'
import { EntityManager } from '@mikro-orm/core'
import { Inject, Injectable } from '@nestjs/common'

export interface TransactionScope {
  analysisDb: AnalysisDbRepository
  analysisJob: AnalysisJobRepository
  assembly: AssemblyRepository
  assemblyPermission: AssemblyPermissionRepository
  organism: OrganismRepository
  feature: FeatureRepository
  refSeq: RefSeqRepository
  checkConfig: CheckRepository
  check: CheckResultRepository
  file: FileRepository
  user: UserRepository
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

@Injectable()
export class DatabaseService {
  private readonly dbType: string

  readonly analysisDb: AnalysisDbRepository
  readonly analysisJob: AnalysisJobRepository
  readonly assembly: AssemblyRepository
  readonly assemblyPermission: AssemblyPermissionRepository
  readonly organism: OrganismRepository
  readonly feature: FeatureRepository
  readonly refSeq: RefSeqRepository
  readonly user: UserRepository
  readonly file: FileRepository
  readonly check: CheckResultRepository
  readonly counter: CounterRepository
  readonly checkConfig: CheckRepository
  readonly trackConfig: TrackConfigRepository
  readonly textSearchAdapterConfig: TextSearchAdapterConfigRepository
  constructor(@Inject(EntityManager) private readonly em: EntityManager) {
    this.dbType = process.env.DB_BACKEND ?? 'sqlite'
    this.analysisDb = new MikroOrmAnalysisDbRepository(em)
    this.analysisJob = new MikroOrmAnalysisJobRepository(em)
    this.assembly = new MikroOrmAssemblyRepository(em)
    this.assemblyPermission = new MikroOrmAssemblyPermissionRepository(em)
    this.organism = new MikroOrmOrganismRepository(em)
    this.feature = createFeatureRepository(em, this.dbType)
    this.refSeq = new MikroOrmRefSeqRepository(em)
    this.user = new MikroOrmUserRepository(em)
    this.file = new MikroOrmFileRepository(em)
    this.check = new MikroOrmCheckResultRepository(em)
    this.counter = new MikroOrmCounterRepository(em)
    this.checkConfig = new MikroOrmCheckRepository(em)
    this.trackConfig = new MikroOrmTrackConfigRepository(em)
    this.textSearchAdapterConfig =
      new MikroOrmTextSearchAdapterConfigRepository(em)
  }

  async getAssemblyNameByRefSeq(refSeqId: string) {
    const refSeq = await this.em.findOne(
      RefSeqEntity,
      { _id: refSeqId },
      { populate: ['assembly'] },
    )
    if (!refSeq) {
      return undefined
    }
    const asm = refSeq.assembly
    if (typeof asm === 'object' && asm.name) {
      return asm.name
    }
    return undefined
  }

  async transactional<T>(callback: (scope: TransactionScope) => Promise<T>) {
    return this.em.transactional(async (txEm) => {
      return callback({
        analysisDb: new MikroOrmAnalysisDbRepository(txEm),
        analysisJob: new MikroOrmAnalysisJobRepository(txEm),
        assembly: new MikroOrmAssemblyRepository(txEm),
        assemblyPermission: new MikroOrmAssemblyPermissionRepository(txEm),
        organism: new MikroOrmOrganismRepository(txEm),
        feature: createFeatureRepository(txEm, this.dbType),
        refSeq: new MikroOrmRefSeqRepository(txEm),
        checkConfig: new MikroOrmCheckRepository(txEm),
        check: new MikroOrmCheckResultRepository(txEm),
        file: new MikroOrmFileRepository(txEm),
        user: new MikroOrmUserRepository(txEm),
        trackConfig: new MikroOrmTrackConfigRepository(txEm),
        textSearchAdapterConfig: new MikroOrmTextSearchAdapterConfigRepository(
          txEm,
        ),
        counter: new MikroOrmCounterRepository(txEm),
      })
    })
  }
}
