import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'counter' })
export class CounterEntity {
  @PrimaryKey()
  _id!: string

  @Property({ default: 0 })
  sequenceValue!: number
}
