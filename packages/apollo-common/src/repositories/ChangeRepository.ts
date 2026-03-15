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
    /** Return only changes where changedIds contains at least one of these feature IDs */
    changedIds?: string[]
    sinceSequence?: number
    sort?: 'asc' | 'desc'
    limit?: number
    offset?: number
  }): Promise<ChangeRow[]>
}
