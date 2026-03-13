import { defineEntity, p } from '@mikro-orm/core'

import { RefSeqEntity } from './RefSeqEntity.js'

export const RefSeqChunkEntity = defineEntity({
  name: 'RefSeqChunkEntity',
  tableName: 'ref_seq_chunk',
  properties: {
    _id: p.string().primary(),
    refSeq: () => p.manyToOne(RefSeqEntity).deleteRule('cascade'),
    n: p.integer(),
    sequence: p.text(),
    status: p.integer().nullable(),
    user: p.string().nullable(),
  },
  indexes: [{ properties: ['refSeq'] }],
})
