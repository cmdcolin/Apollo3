export interface BlastJobRow {
  _id: string
  status: string
  program: string
  database: string
  query: string
  ncbiRid?: string
  results?: unknown
  error?: string
  createdBy?: string
  createdAt: Date
  startedAt?: Date
}

export interface BlastJobRepository {
  findById(id: string): Promise<BlastJobRow | undefined>
  findByUser(userId: string): Promise<BlastJobRow[]>
  create(row: BlastJobRow): Promise<BlastJobRow>
  updateById(
    id: string,
    data: Partial<Omit<BlastJobRow, '_id'>>,
  ): Promise<BlastJobRow | undefined>
  findPending(limit: number): Promise<BlastJobRow[]>
  countByStatus(status: string): Promise<number>
  findRunningOlderThan(cutoff: Date): Promise<BlastJobRow[]>
  deleteCompletedOlderThan(cutoff: Date): Promise<number>
  resetOrphanedRunning(): Promise<number>
}
