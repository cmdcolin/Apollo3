export interface FileRow {
  _id: string
  basename: string
  checksum: string
  type:
    | 'text/x-gff3'
    | 'text/x-fasta'
    | 'application/x-bgzip-fasta'
    | 'text/x-fai'
    | 'application/x-gzi'
}

export interface FileRepository {
  findById(id: string): Promise<FileRow | undefined>
  create(row: FileRow): Promise<FileRow>
  deleteById(id: string): Promise<boolean>
}
