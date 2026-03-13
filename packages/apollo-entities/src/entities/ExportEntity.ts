import { Entity, ManyToOne, PrimaryKey, Property } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

@Entity({ tableName: 'export' })
export class ExportEntity {
  @PrimaryKey()
  _id!: string

  @ManyToOne(() => AssemblyEntity, { deleteRule: 'cascade' })
  assembly!: AssemblyEntity

  @Property({ nullable: true })
  createdAt?: Date
}
