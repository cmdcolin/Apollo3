export interface OrganismRow {
  _id: string
  taxid?: number
  genus?: string
  species?: string
  commonName?: string
  description?: string
  user?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface PaginationOptions {
  offset?: number
  limit?: number
}

export interface OrganismRepository {
  findById(id: string): Promise<OrganismRow | undefined>
  findByTaxid(taxid: number): Promise<OrganismRow | undefined>
  findAll(opts?: PaginationOptions): Promise<OrganismRow[]>
  count(): Promise<number>
  create(row: OrganismRow): Promise<OrganismRow>
  updateById(
    id: string,
    data: Partial<Omit<OrganismRow, '_id'>>,
  ): Promise<OrganismRow | undefined>
  deleteById(id: string): Promise<boolean>
}
