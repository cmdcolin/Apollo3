import { defineEntity, p } from '@mikro-orm/core'

export const FeatureHistoryEntity = defineEntity({
  name: 'FeatureHistoryEntity',
  tableName: 'feature_history',
  properties: {
    _id: p.string().primary(),
    featureId: p.string(),
    refSeq: p.string(),
    parentId: p.string().nullable(),
    type: p.string(),
    min: p.integer(),
    max: p.integer(),
    strand: p.integer().nullable(),
    phase: p.integer().nullable(),
    attributes: p.json<Record<string, string[]>>().nullable(),
    changeType: p.string(),
    changedBy: p.string().nullable(),
    changedAt: p.datetime(),
    sequence: p.integer().nullable(),
  },
  indexes: [
    { properties: ['featureId'] },
    { properties: ['sequence'] },
    { properties: ['refSeq'] },
  ],
})
