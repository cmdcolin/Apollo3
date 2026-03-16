import { defineEntity, p } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

export const BlastDbEntity = defineEntity({
  name: 'BlastDbEntity',
  tableName: 'blast_db',
  properties: {
    _id: p.string().primary(),
    name: p.string(),
    program: p.string(),
    database: p.string(),
    assemblies: () =>
      p.manyToMany(AssemblyEntity).pivotTable('blast_db_assembly'),
    createdBy: p.string().nullable(),
  },
})
