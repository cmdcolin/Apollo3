import { Entity, Enum, PrimaryKey, Property } from '@mikro-orm/core'

export enum FileType {
  GFF3 = 'text/x-gff3',
  FASTA = 'text/x-fasta',
  BGZIP_FASTA = 'application/x-bgzip-fasta',
  FAI = 'text/x-fai',
  GZI = 'application/x-gzi',
}

@Entity({ tableName: 'file' })
export class FileEntity {
  @PrimaryKey()
  _id!: string

  @Property()
  basename!: string

  @Property()
  checksum!: string

  @Enum(() => FileType)
  type!: FileType
}
