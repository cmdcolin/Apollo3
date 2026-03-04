import { Entity, PrimaryKey, Property } from '@mikro-orm/core'

@Entity({ tableName: 'jbrowse_config' })
export class JBrowseConfigEntity {
  @PrimaryKey()
  _id!: string

  @Property({ type: 'json' })
  config!: Record<string, unknown>
}
