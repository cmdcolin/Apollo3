export interface ChangeRow {
  _id: string
  assembly?: string
  typeName: string
  changedIds: string[]
  changes: unknown
  user: string
  sequence?: number
  createdAt?: Date
  updatedAt?: Date
}

export interface ChangeRepository {
  create(row: Omit<ChangeRow, '_id'>): Promise<ChangeRow>
  findAll(opts?: {
    filter?: Partial<Pick<ChangeRow, 'assembly' | 'user' | 'typeName'>>
    sinceSequence?: number
    sort?: 'asc' | 'desc'
    limit?: number
  }): Promise<ChangeRow[]>
}
