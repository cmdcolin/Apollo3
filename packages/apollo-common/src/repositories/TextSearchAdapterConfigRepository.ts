export interface TextSearchAdapterConfigRow {
  _id: string
  textSearchAdapterId: string
  assemblyIds: string[]
  config: Record<string, unknown>
}

export interface TextSearchAdapterConfigRepository {
  findById(id: string): Promise<TextSearchAdapterConfigRow | undefined>
  findByAdapterId(
    adapterId: string,
  ): Promise<TextSearchAdapterConfigRow | undefined>
  findByAssemblyId(assemblyId: string): Promise<TextSearchAdapterConfigRow[]>
  findByAssemblyIds(
    assemblyIds: string[],
  ): Promise<TextSearchAdapterConfigRow[]>
  findAll(): Promise<TextSearchAdapterConfigRow[]>
  create(row: TextSearchAdapterConfigRow): Promise<TextSearchAdapterConfigRow>
  updateById(
    id: string,
    data: Partial<Omit<TextSearchAdapterConfigRow, '_id'>>,
  ): Promise<TextSearchAdapterConfigRow | undefined>
  deleteById(id: string): Promise<boolean>
  removeAssemblyFromAdapters(assemblyId: string): Promise<void>
}
