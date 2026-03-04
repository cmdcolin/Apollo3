import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'check' })
export class CheckEntity {
  @PrimaryKey()
  _id!: string

  @Property()
  name!: string

  @Property({ type: 'json', nullable: true })
  causes?: string[]

  @Property({ nullable: true })
  isDefault?: boolean

  @Property({ nullable: true })
  version?: number

  @Property({ nullable: true })
  createdAt?: Date

  @Property({ nullable: true, onUpdate: () => new Date() })
  updatedAt?: Date
}
