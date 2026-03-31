export interface FeatureRow {
  _id: string
  parentId?: string
  assembly: string
  refSeq: string
  type: string
  min: number
  max: number
  strand?: 1 | -1
  phase?: 0 | 1 | 2
  attributes?: Record<string, string[]>
  user?: string
  createdAt?: Date
  updatedAt?: Date
}

export interface FeatureRepository {
  findById(id: string): Promise<FeatureRow | undefined>
  findByIds(ids: string[]): Promise<FeatureRow[]>
  findAll(): Promise<FeatureRow[]>
  countAll(): Promise<number>
  countByRange(
    assemblyId: string,
    refSeq: string,
    start: number,
    end: number,
  ): Promise<number>
  countByAssembly(
    assemblyId: string,
    start: number,
    end: number,
  ): Promise<number>
  findRootParentsOfMany(ids: string[]): Promise<FeatureRow[]>
  findByRange(
    assemblyId: string,
    refSeq: string,
    start: number,
    end: number,
  ): Promise<FeatureRow[]>
  findRootsByRange(
    assemblyId: string,
    refSeq: string,
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
  deleteByAssembly(assemblyId: string): Promise<number>
  searchText(assemblyId: string, query: string): Promise<FeatureRow[]>
  findByIndexedId(id: string, assemblyId?: string): Promise<FeatureRow[]>
  findRootParent(id: string): Promise<FeatureRow | undefined>
}
