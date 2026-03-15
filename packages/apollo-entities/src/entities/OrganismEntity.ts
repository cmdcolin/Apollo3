import { defineEntity, p } from '@mikro-orm/core'

export const OrganismEntity = defineEntity({
  name: 'OrganismEntity',
  tableName: 'organism',
  properties: {
    _id: p.string().primary(),
    taxid: p.integer().nullable(),
    genus: p.string().nullable(),
    species: p.string().nullable(),
    commonName: p.string().nullable(),
    description: p.string().nullable(),
    user: p.string().nullable(),
    createdAt: p.datetime().nullable().onCreate(() => new Date()),
    updatedAt: p
      .datetime()
      .nullable()
      .onCreate(() => new Date())
      .onUpdate(() => new Date()),
  },
  indexes: [{ properties: ['taxid'] }],
})
