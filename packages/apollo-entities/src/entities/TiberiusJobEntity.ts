import { defineEntity, p } from '@mikro-orm/core'

export const TiberiusJobEntity = defineEntity({
  name: 'TiberiusJobEntity',
  tableName: 'tiberius_job',
  properties: {
    _id: p.string().primary(),
    status: p.string().default('pending'),
    assemblyId: p.string(),
    refSeqId: p.string(),
    refSeqName: p.string(),
    start: p.integer(),
    end: p.integer(),
    modelCfg: p.string().nullable(),
    useSingularity: p.boolean().default(false),
    trackConfigId: p.string().nullable(),
    error: p.string().nullable(),
    createdBy: p.string().nullable(),
    createdAt: p.datetime().default('now'),
    startedAt: p.datetime().nullable(),
  },
  indexes: [{ properties: ['status'] }, { properties: ['assemblyId'] }],
})
