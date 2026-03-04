export interface AssemblyRow {
  _id: string
  name: string
  displayName?: string
  aliases?: string[]
  description?: string
  status?: number
  user?: string
  externalLocation?: { fa: string; fai: string; gzi?: string }
  fileIds?: { fa: string; fai: string; gzi: string }
  checks?: string[]
  file?: string
}

export interface AssemblyRepository {
  findById(id: string): Promise<AssemblyRow | undefined>
  findByName(name: string): Promise<AssemblyRow | undefined>
  create(row: AssemblyRow): Promise<AssemblyRow>
  updateById(
    id: string,
    data: Partial<Omit<AssemblyRow, '_id'>>,
  ): Promise<AssemblyRow | undefined>
  deleteById(id: string): Promise<boolean>
}
