import { defineEntity, p } from '@mikro-orm/core'

import { RefSeqEntity } from './RefSeqEntity.js'

export const FeatureEntity = defineEntity({
  name: 'FeatureEntity',
  tableName: 'feature',
  properties: {
    _id: p.string().primary(),
    parent: () => p.manyToOne(FeatureEntity).nullable().deleteRule('cascade'),
    refSeq: () => p.manyToOne(RefSeqEntity).deleteRule('cascade'),
    type: p.string(),
    min: p.integer(),
    max: p.integer(),
    strand: p.integer().nullable(),
    phase: p.integer().nullable(),
    attributes: p.json<Record<string, string[]>>().nullable(),
    status: p.integer().nullable(),
    user: p.string().nullable(),
    createdAt: p.datetime().nullable(),
    updatedAt: p.datetime().nullable().onUpdate(() => new Date()),
  },
  indexes: [
    { properties: ['refSeq', 'min', 'max'] },
    { properties: ['parent'] },
  ],
})
