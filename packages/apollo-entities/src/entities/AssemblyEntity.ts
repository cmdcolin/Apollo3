import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

import { FileEntity } from './FileEntity.js'

@Entity({ tableName: 'assembly' })
export class AssemblyEntity {
  @PrimaryKey()
  _id!: string

  @Property()
  name!: string

  @Property({ nullable: true })
  displayName?: string

  @Property({ type: 'json', nullable: true })
  aliases?: string[]

  @Property({ nullable: true })
  description?: string

  @Property({ nullable: true })
  status?: number

  @Property({ nullable: true })
  user?: string

  @Property({ type: 'json', nullable: true })
  externalLocation?: { fa: string; fai: string; gzi?: string }

  @Property({ type: 'json', nullable: true })
  fileIds?: { fa: string } | { fa: string; fai: string; gzi: string }

  @Property({ type: 'json', nullable: true })
  checks?: string[]

  @ManyToOne(() => FileEntity, { nullable: true })
  file?: FileEntity
}
