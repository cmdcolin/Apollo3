export interface TiberiusJobRow {
  _id: string
  status: string
  assemblyId: string
  refSeqId: string
  refSeqName: string
  start: number
  end: number
  modelCfg?: string
  useSingularity: boolean
  trackConfigId?: string
  error?: string
  createdBy?: string
  createdAt: Date
  startedAt?: Date
}

export interface TiberiusJobRepository {
  findById(id: string): Promise<TiberiusJobRow | undefined>
  findByAssemblyId(assemblyId: string): Promise<TiberiusJobRow[]>
  findByUser(userId: string): Promise<TiberiusJobRow[]>
  create(row: TiberiusJobRow): Promise<TiberiusJobRow>
  updateById(
    id: string,
    data: Partial<Omit<TiberiusJobRow, '_id'>>,
  ): Promise<TiberiusJobRow | undefined>
  findPending(limit: number): Promise<TiberiusJobRow[]>
  countByStatus(status: string): Promise<number>
  findRunningOlderThan(cutoff: Date): Promise<TiberiusJobRow[]>
  deleteOlderThan(
    cutoff: Date,
    statuses: string[],
  ): Promise<TiberiusJobRow[]>
  resetOrphanedRunning(): Promise<number>
}
