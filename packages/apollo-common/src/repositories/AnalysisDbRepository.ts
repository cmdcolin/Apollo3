export interface AnalysisDbRow {
  _id: string
  name: string
  tool: string
  dbPath?: string
  status: string
  params: Record<string, unknown>
  assemblyIds: string[]
  createdBy?: string
}

export interface AnalysisDbRepository {
  findById(id: string): Promise<AnalysisDbRow | undefined>
  findByAssemblyId(assemblyId: string): Promise<AnalysisDbRow[]>
  findByTool(tool: string): Promise<AnalysisDbRow[]>
  findAll(): Promise<AnalysisDbRow[]>
  create(row: AnalysisDbRow): Promise<AnalysisDbRow>
  updateById(
    id: string,
    data: Partial<Omit<AnalysisDbRow, '_id'>>,
  ): Promise<AnalysisDbRow | undefined>
  deleteById(id: string): Promise<boolean>
  removeAssemblyFromDbs(assemblyId: string): Promise<void>
}
