import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

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
  sequenceSource?:
    | { type: 'external'; fa: string; fai: string; gzi?: string }
    | { type: 'indexed'; fa: string; fai: string; gzi: string }
    | { type: 'chunked'; fa: string }

  @Property({ type: 'json', nullable: true })
  checks?: string[]
}
