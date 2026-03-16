import { defineEntity, p } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

export const TextSearchAdapterConfigEntity = defineEntity({
  name: 'TextSearchAdapterConfigEntity',
  tableName: 'text_search_adapter_config',
  properties: {
    _id: p.string().primary(),
    textSearchAdapterId: p.string().unique(),
    assemblies: () =>
      p
        .manyToMany(AssemblyEntity)
        .pivotTable('text_search_adapter_config_assembly'),
    config: p.json<Record<string, unknown>>(),
  },
})
