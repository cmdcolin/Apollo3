import { defineEntity, p } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

export const CheckResultEntity = defineEntity({
  name: 'CheckResultEntity',
  tableName: 'check_result',
  properties: {
    _id: p.string().primary(),
    name: p.string(),
    cause: p.string().nullable(),
    featureId: p.string(),
    assembly: () => p.manyToOne(AssemblyEntity).deleteRule('cascade'),
    refSeq: p.string(),
    start: p.integer(),
    end: p.integer(),
    ignored: p.boolean().default(false),
    message: p.string().nullable(),
  },
  indexes: [
    { properties: ['assembly', 'refSeq', 'start'] },
    { properties: ['assembly', 'refSeq', 'end'] },
    { properties: ['name'] },
    { properties: ['featureId'] },
  ],
})
