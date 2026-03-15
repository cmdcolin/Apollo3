import { defineEntity, p } from '@mikro-orm/core'

import { OrganismEntity } from './OrganismEntity.js'

type SequenceSource =
  | { type: 'external'; fa: string; fai: string; gzi?: string }
  | { type: 'indexed'; fa: string; fai: string; gzi: string }
  | { type: 'chunked'; fa: string }

export const AssemblyEntity = defineEntity({
  name: 'AssemblyEntity',
  tableName: 'assembly',
  properties: {
    _id: p.string().primary(),
    name: p.string(),
    displayName: p.string().nullable(),
    aliases: p.json<string[]>().nullable(),
    description: p.string().nullable(),
    user: p.string().nullable(),
    sequenceSource: p.json<SequenceSource>().nullable(),
    checks: p.json<string[]>().nullable(),
    organism: () => p.manyToOne(OrganismEntity).nullable(),
  },
  indexes: [{ properties: ['organism'] }],
})
