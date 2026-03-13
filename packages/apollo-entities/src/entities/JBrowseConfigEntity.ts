import { defineEntity, p } from '@mikro-orm/core'

export const JBrowseConfigEntity = defineEntity({
  name: 'JBrowseConfigEntity',
  tableName: 'jbrowse_config',
  properties: {
    _id: p.string().primary(),
    config: p.json<Record<string, unknown>>(),
  },
})
