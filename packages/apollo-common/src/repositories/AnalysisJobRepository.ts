export interface AnalysisJobRow {
  _id: string
  status: string
  tool: string
  assemblyId?: string
  params: Record<string, unknown>
  results?: unknown
  metadata?: Record<string, unknown>
  error?: string
  createdBy?: string
  createdAt: Date
  startedAt?: Date
}

export interface AnalysisJobRepository {
  findById(id: string): Promise<AnalysisJobRow | undefined>
  findByUser(userId: string): Promise<AnalysisJobRow[]>
  create(row: AnalysisJobRow): Promise<AnalysisJobRow>
  updateById(
    id: string,
    data: Partial<Omit<AnalysisJobRow, '_id'>>,
  ): Promise<AnalysisJobRow | undefined>
  findPending(limit: number): Promise<AnalysisJobRow[]>
  countByStatus(status: string): Promise<number>
  findRunningOlderThan(cutoff: Date): Promise<AnalysisJobRow[]>
  deleteCompletedOlderThan(cutoff: Date): Promise<number>
  resetOrphanedRunning(): Promise<number>
}
