import { defineEntity, p } from '@mikro-orm/core'

export const ChangeEntity = defineEntity({
  name: 'ChangeEntity',
  tableName: 'change',
  properties: {
    _id: p.string().primary(),
    assembly: p.string().nullable(),
    geneId: p.string().nullable(),
    typeName: p.string(),
    changedIds: p.json<string[]>(),
    changes: p.json<unknown>(),
    reverts: () => p.manyToOne(ChangeEntity).nullable(),
    user: p.string(),
    sequence: p.integer().nullable(),
    createdAt: p.datetime().nullable(),
    updatedAt: p
      .datetime()
      .nullable()
      .onUpdate(() => new Date()),
  },
  indexes: [
    { properties: ['assembly'] },
    { properties: ['sequence'] },
    { properties: ['geneId'] },
  ],
})
