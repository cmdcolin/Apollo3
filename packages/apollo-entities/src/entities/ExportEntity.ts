import { defineEntity, p } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

export const ExportEntity = defineEntity({
  name: 'ExportEntity',
  tableName: 'export',
  properties: {
    _id: p.string().primary(),
    assembly: () => p.manyToOne(AssemblyEntity).deleteRule('cascade'),
    createdAt: p.datetime().nullable(),
  },
})
