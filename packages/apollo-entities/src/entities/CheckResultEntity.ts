import { defineEntity, p } from '@mikro-orm/core'

import { RefSeqEntity } from './RefSeqEntity.js'

export const CheckResultEntity = defineEntity({
  name: 'CheckResultEntity',
  tableName: 'check_result',
  properties: {
    _id: p.string().primary(),
    name: p.string(),
    cause: p.string().nullable(),
    featureId: p.string(),
    refSeq: () => p.manyToOne(RefSeqEntity).deleteRule('cascade'),
    start: p.integer(),
    end: p.integer(),
    ignored: p.boolean().default(false),
    message: p.string().nullable(),
  },
  indexes: [
    { properties: ['refSeq', 'start'] },
    { properties: ['refSeq', 'end'] },
    { properties: ['name'] },
    { properties: ['featureId'] },
  ],
})
