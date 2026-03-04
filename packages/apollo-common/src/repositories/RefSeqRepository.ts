export interface RefSeqRow {
  _id: string
  assembly: string
  name: string
  description?: string
  aliases?: string[]
  length: number
  chunkSize: number
  status?: number
  user?: string
}

export interface RefSeqRepository {
  findById(id: string): Promise<RefSeqRow | undefined>
  findByAssembly(assemblyId: string): Promise<RefSeqRow[]>
  create(row: RefSeqRow): Promise<RefSeqRow>
  updateById(
    id: string,
    data: Partial<Omit<RefSeqRow, '_id'>>,
  ): Promise<RefSeqRow | undefined>
}
