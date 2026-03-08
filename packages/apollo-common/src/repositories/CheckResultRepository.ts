export interface CheckResultRow {
  _id: string
  name: string
  cause?: string
  ids: string[]
  refSeq: string
  start: number
  end: number
  ignored: boolean
  message?: string
}

export interface CheckResultRepository {
  findByRange(
    refSeqId: string,
    start: number,
    end: number,
  ): Promise<CheckResultRow[]>
  findByRefSeqIds(refSeqIds: string[]): Promise<CheckResultRow[]>
  findByFeatureId(featureId: string): Promise<CheckResultRow[]>
  create(row: CheckResultRow): Promise<CheckResultRow>
  createMany(rows: CheckResultRow[]): Promise<CheckResultRow[]>
  deleteByIds(ids: string[]): Promise<number>
  deleteByRefSeq(refSeqId: string): Promise<number>
  deleteByFeatureIdsAndName(
    featureIds: string[],
    checkName: string,
  ): Promise<number>
  updateById(
    id: string,
    data: Partial<Omit<CheckResultRow, '_id'>>,
  ): Promise<CheckResultRow | undefined>
}
