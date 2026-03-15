import { defineEntity, p } from '@mikro-orm/core'

export const CheckEntity = defineEntity({
  name: 'CheckEntity',
  tableName: 'check',
  properties: {
    _id: p.string().primary(),
    name: p.string(),
    causes: p.json<string[]>().nullable(),
    isDefault: p.boolean().nullable(),
    version: p.integer().nullable(),
    createdAt: p.datetime().nullable(),
    updatedAt: p
      .datetime()
      .nullable()
      .onUpdate(() => new Date()),
  },
})
