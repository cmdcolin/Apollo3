import { defineEntity, p } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

export const FeatureEntity = defineEntity({
  name: 'FeatureEntity',
  tableName: 'feature',
  properties: {
    _id: p.string().primary(),
    parent: () => p.manyToOne(FeatureEntity).nullable().deleteRule('cascade'),
    assembly: () => p.manyToOne(AssemblyEntity).deleteRule('cascade'),
    refSeq: p.string(),
    type: p.string(),
    min: p.integer(),
    max: p.integer(),
    strand: p.integer().nullable(),
    phase: p.integer().nullable(),
    attributes: p.json<Record<string, string[]>>().nullable(),
    user: p.string().nullable(),
    createdAt: p.datetime().nullable(),
    updatedAt: p
      .datetime()
      .nullable()
      .onUpdate(() => new Date()),
  },
  indexes: [
    { properties: ['assembly', 'refSeq', 'min', 'max'] },
    { properties: ['refSeq'] },
    { properties: ['parent'] },
  ],
})
