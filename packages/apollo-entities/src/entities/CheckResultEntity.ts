import { Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

import { RefSeqEntity } from './RefSeqEntity.js'

@Entity({ tableName: 'check_result' })
@Index({ properties: ['refSeq', 'start'] })
@Index({ properties: ['refSeq', 'end'] })
export class CheckResultEntity {
  @PrimaryKey()
  _id!: string

  @Property()
  name!: string

  @Property({ nullable: true })
  cause?: string

  @Property({ type: 'json' })
  ids!: string[]

  @ManyToOne(() => RefSeqEntity)
  refSeq!: RefSeqEntity

  @Property()
  start!: number

  @Property()
  end!: number

  @Property({ default: false })
  ignored!: boolean

  @Property({ nullable: true })
  message?: string
}
