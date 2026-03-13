import { Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

@Entity({ tableName: 'ref_seq' })
@Index({ properties: ['assembly'] })
export class RefSeqEntity {
  @PrimaryKey()
  _id!: string

  @ManyToOne(() => AssemblyEntity, { deleteRule: 'cascade' })
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
