import { defineEntity, p } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'

export const TrackConfigEntity = defineEntity({
  name: 'TrackConfigEntity',
  tableName: 'track_config',
  properties: {
    _id: p.string().primary(),
    trackId: p.string().unique(),
    assemblies: () =>
      p.manyToMany(AssemblyEntity).pivotTable('track_config_assembly'),
    config: p.json<Record<string, unknown>>(),
    createdBy: p.string().nullable(),
  },
})
