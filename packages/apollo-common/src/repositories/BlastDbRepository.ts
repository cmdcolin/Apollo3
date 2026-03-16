export interface BlastDbRow {
  _id: string
  name: string
  program: string
  database: string
  assemblyIds: string[]
  createdBy?: string
}

export interface BlastDbRepository {
  findById(id: string): Promise<BlastDbRow | undefined>
  findByAssemblyId(assemblyId: string): Promise<BlastDbRow[]>
  findAll(): Promise<BlastDbRow[]>
  create(row: BlastDbRow): Promise<BlastDbRow>
  deleteById(id: string): Promise<boolean>
  removeAssemblyFromBlastDbs(assemblyId: string): Promise<void>
}
