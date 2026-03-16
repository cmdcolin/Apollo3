export interface ChangeRow {
  _id: string
  assembly?: string
  geneId?: string
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
    filter?: Partial<Pick<ChangeRow, 'assembly' | 'user' | 'typeName' | 'geneId'>>
    /** Return only changes where changedIds contains at least one of these feature IDs */
    changedIds?: string[]
    sinceSequence?: number
    sort?: 'asc' | 'desc'
    limit?: number
    offset?: number
  }): Promise<ChangeRow[]>
  /** Count changes matching the given geneId */
  countByGeneId?(geneId: string): Promise<number>
  /** Update the geneId for a specific change record (used by backfill) */
  updateGeneId(changeId: string, geneId: string): Promise<void>
}
