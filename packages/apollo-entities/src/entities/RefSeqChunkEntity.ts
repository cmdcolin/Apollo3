import { Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

import { RefSeqEntity } from './RefSeqEntity.js'

@Entity({ tableName: 'ref_seq_chunk' })
@Index({ properties: ['refSeq'] })
export class RefSeqChunkEntity {
  @PrimaryKey()
  _id!: string

  @ManyToOne(() => RefSeqEntity)
  refSeq!: RefSeqEntity

  @Property()
  n!: number

  @Property({ type: 'text' })
  sequence!: string

  @Property({ nullable: true })
  status?: number

  @Property({ nullable: true })
  user?: string
}
