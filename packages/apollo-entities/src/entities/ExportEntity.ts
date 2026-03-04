import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity'

@Entity({ tableName: 'export' })
export class ExportEntity {
  @PrimaryKey()
  _id!: string

  @ManyToOne(() => AssemblyEntity)
  assembly!: AssemblyEntity

  @Property({ nullable: true })
  createdAt?: Date
}
