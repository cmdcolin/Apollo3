import { Entity, Index, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

import { RefSeqEntity } from './RefSeqEntity.js'

@Entity({ tableName: 'feature' })
@Index({ properties: ['refSeq', 'min', 'max'] })
@Index({ properties: ['parent'] })
export class FeatureEntity {
  @PrimaryKey()
  _id!: string

  @ManyToOne(() => FeatureEntity, { nullable: true, deleteRule: 'cascade' })
  parent?: FeatureEntity

  @ManyToOne(() => RefSeqEntity, { deleteRule: 'cascade' })
  refSeq!: RefSeqEntity

  @Property()
  type!: string

  @Property()
  min!: number

  @Property()
  max!: number

  @Property({ nullable: true })
  strand?: 1 | -1

  @Property({ nullable: true })
  phase?: 0 | 1 | 2

  @Property({ type: 'json', nullable: true })
  attributes?: Record<string, string[]>

  @Property({ nullable: true })
  status?: number

  @Property({ nullable: true })
  user?: string

  @Property({ nullable: true })
  createdAt?: Date

  @Property({ nullable: true, onUpdate: () => new Date() })
  updatedAt?: Date
}
