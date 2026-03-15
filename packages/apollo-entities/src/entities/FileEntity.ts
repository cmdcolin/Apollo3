import { defineEntity, p } from '@mikro-orm/core'

export enum FileType {
  GFF3 = 'text/x-gff3',
  FASTA = 'text/x-fasta',
  BGZIP_FASTA = 'application/x-bgzip-fasta',
  FAI = 'text/x-fai',
  GZI = 'application/x-gzi',
}

export const FileEntity = defineEntity({
  name: 'FileEntity',
  tableName: 'file',
  properties: {
    _id: p.string().primary(),
    basename: p.string(),
    checksum: p.string(),
    type: p.enum(() => FileType),
  },
  indexes: [{ properties: ['checksum'] }],
})
