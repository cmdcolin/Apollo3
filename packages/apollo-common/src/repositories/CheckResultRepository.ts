export interface CheckResultRow {
  _id: string
  name: string
  cause?: string
  featureId: string
  assembly: string
  refSeq: string
  start: number
  end: number
  ignored: boolean
  message?: string
}

export interface CheckResultRepository {
  findByRange(
    assemblyId: string,
    refSeq: string,
    start: number,
    end: number,
  ): Promise<CheckResultRow[]>
  findByAssembly(assemblyId: string): Promise<CheckResultRow[]>
  findByFeatureId(featureId: string): Promise<CheckResultRow[]>
  findByFeatureIds(featureIds: string[]): Promise<CheckResultRow[]>
  create(row: CheckResultRow): Promise<CheckResultRow>
  createMany(rows: CheckResultRow[]): Promise<CheckResultRow[]>
  deleteByIds(ids: string[]): Promise<number>
  deleteByAssembly(assemblyId: string): Promise<number>
  deleteByFeatureIdsAndName(
    featureIds: string[],
    checkName: string,
  ): Promise<number>
  updateById(
    id: string,
    data: Partial<Omit<CheckResultRow, '_id'>>,
  ): Promise<CheckResultRow | undefined>
}
