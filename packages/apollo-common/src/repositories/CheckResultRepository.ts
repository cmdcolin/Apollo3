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
  create(row: CheckResultRow): Promise<CheckResultRow>
  createMany(rows: CheckResultRow[]): Promise<CheckResultRow[]>
  deleteByRefSeq(refSeqId: string): Promise<number>
}
