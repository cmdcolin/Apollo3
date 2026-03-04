import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'change' })
export class ChangeEntity {
  @PrimaryKey()
  _id!: string

  @Property({ nullable: true })
  assembly?: string

  @Property()
  typeName!: string

  @Property({ type: 'json' })
  changedIds!: string[]

  @Property({ type: 'json' })
  changes!: unknown

  @ManyToOne(() => ChangeEntity, { nullable: true })
  reverts?: ChangeEntity

  @Property()
  user!: string

  @Property({ nullable: true })
  sequence?: number

  @Property({ nullable: true })
  createdAt?: Date

  @Property({ nullable: true, onUpdate: () => new Date() })
  updatedAt?: Date
}
