export interface RefSeqChunkRow {
  _id: string
  refSeq: string
  n: number
  sequence: string
  status?: number
  user?: string
}

export interface RefSeqChunkRepository {
  findByRefSeq(refSeqId: string): Promise<RefSeqChunkRow[]>
  create(row: RefSeqChunkRow): Promise<RefSeqChunkRow>
}
