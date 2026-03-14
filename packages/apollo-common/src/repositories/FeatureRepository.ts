export interface FeatureRow {
  _id: string
  parentId?: string
  refSeq: string
  type: string
  min: number
  max: number
  strand?: 1 | -1
  phase?: 0 | 1 | 2
  attributes?: Record<string, string[]>
  status?: number
  user?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface FeatureRepository {
  findById(id: string): Promise<FeatureRow | undefined>
  findByIds(ids: string[]): Promise<FeatureRow[]>
  findAll(): Promise<FeatureRow[]>
  countAll(): Promise<number>
  countByRange(refSeqId: string, start: number, end: number): Promise<number>
  findByRange(
    refSeqId: string,
    start: number,
    end: number,
  ): Promise<FeatureRow[]>
  findRootsByRange(
    refSeqId: string,
    start: number,
    end: number,
  ): Promise<FeatureRow[]>
  findChildren(parentId: string): Promise<FeatureRow[]>
  findDescendants(rootId: string): Promise<FeatureRow[]>
  findDescendantsOfMany(rootIds: string[]): Promise<FeatureRow[]>
  create(row: FeatureRow): Promise<FeatureRow>
  createMany(rows: FeatureRow[]): Promise<FeatureRow[]>
  updateById(
    id: string,
    data: Partial<Omit<FeatureRow, '_id'>>,
  ): Promise<FeatureRow | undefined>
  deleteById(id: string): Promise<boolean>
  deleteDescendants(id: string): Promise<number>
  deleteByRefSeqs(refSeqIds: string[]): Promise<number>
  searchText(refSeqIds: string[], query: string): Promise<FeatureRow[]>
  activateByUser(user: string): Promise<number>
  findByIndexedId(id: string, refSeqIds?: string[]): Promise<FeatureRow[]>
  findRootParent(id: string): Promise<FeatureRow | undefined>
}
