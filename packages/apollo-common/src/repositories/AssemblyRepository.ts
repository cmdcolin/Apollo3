export type SequenceSource =
  | { type: 'external'; fa: string; fai: string; gzi?: string }
  | { type: 'indexed'; fa: string; fai: string; gzi: string }
  | { type: 'chunked'; fa: string }

export interface AssemblyRow {
  _id: string
  name: string
  displayName?: string
  aliases?: string[]
  description?: string
  user?: string
  sequenceSource?: SequenceSource
  checks?: string[]
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
  findAll(): Promise<AssemblyRow[]>
}
