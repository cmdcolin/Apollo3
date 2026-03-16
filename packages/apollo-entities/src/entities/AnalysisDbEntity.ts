import { defineEntity, p } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

export const AnalysisDbEntity = defineEntity({
  name: 'AnalysisDbEntity',
  tableName: 'analysis_db',
  properties: {
    _id: p.string().primary(),
    name: p.string(),
    tool: p.string(),
    dbPath: p.string().nullable(),
    status: p.string().default('ready'),
    params: p.json<Record<string, unknown>>().default('{}'),
    assemblies: () =>
      p.manyToMany(AssemblyEntity).pivotTable('analysis_db_assembly'),
    createdBy: p.string().nullable(),
  },
})
