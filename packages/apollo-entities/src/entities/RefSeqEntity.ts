import { defineEntity, p } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

export const RefSeqEntity = defineEntity({
  name: 'RefSeqEntity',
  tableName: 'ref_seq',
  properties: {
    _id: p.string().primary(),
    assembly: () => p.manyToOne(AssemblyEntity).deleteRule('cascade'),
    name: p.string(),
    description: p.string().nullable(),
    aliases: p.json<string[]>().nullable(),
    length: p.integer(),
    chunkSize: p.integer().default(256 * 1024),
    user: p.string().nullable(),
  },
  indexes: [{ properties: ['assembly'] }],
})
