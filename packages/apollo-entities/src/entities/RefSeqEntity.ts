import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity'

@Entity({ tableName: 'ref_seq' })
export class RefSeqEntity {
  @PrimaryKey()
  _id!: string

  @ManyToOne(() => AssemblyEntity)
  assembly!: AssemblyEntity

  @Property()
  name!: string

  @Property({ nullable: true })
  description?: string

  @Property({ type: 'json', nullable: true })
  aliases?: string[]

  @Property()
  length!: number

  @Property({ default: 256 * 1024 })
  chunkSize!: number

  @Property({ nullable: true })
  status?: number

  @Property({ nullable: true })
  user?: string
}
