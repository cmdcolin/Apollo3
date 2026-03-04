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
  findByRefSeqAndRange(
    refSeqId: string,
    startN: number,
    endN: number,
  ): Promise<RefSeqChunkRow[]>
  create(row: RefSeqChunkRow): Promise<RefSeqChunkRow>
  deleteByRefSeqs(refSeqIds: string[]): Promise<number>
  createMany(rows: RefSeqChunkRow[]): Promise<RefSeqChunkRow[]>
}
