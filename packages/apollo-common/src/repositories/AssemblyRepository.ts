export type SequenceSource =
  | { type: 'fasta'; fa: string; fai: string; gzi?: string }
  | { type: 'twobit'; twobit: string }

export interface AssemblyRow {
  _id: string
  name: string
  displayName?: string
  aliases?: string[]
  description?: string
  user?: string
  sequenceSource?: SequenceSource
  checks?: string[]
  organism?: string
  visibility?: 'public' | 'private'
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
  findByIds(ids: string[]): Promise<AssemblyRow[]>
  findPublic(): Promise<AssemblyRow[]>
  findAllIds(): Promise<string[]>
}
