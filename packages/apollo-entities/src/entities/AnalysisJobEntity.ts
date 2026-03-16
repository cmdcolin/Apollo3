import { defineEntity, p } from '@mikro-orm/core'

export const AnalysisJobEntity = defineEntity({
  name: 'AnalysisJobEntity',
  tableName: 'analysis_job',
  properties: {
    _id: p.string().primary(),
    status: p.string().default('pending'),
    tool: p.string(),
    assemblyId: p.string().nullable(),
    params: p.json<Record<string, unknown>>().default('{}'),
    results: p.json<unknown>().nullable(),
    metadata: p.json<Record<string, unknown>>().nullable(),
    error: p.string().nullable(),
    createdBy: p.string().nullable(),
    createdAt: p.datetime().default('now'),
    startedAt: p.datetime().nullable(),
  },
  indexes: [{ properties: ['status'] }, { properties: ['tool'] }],
})
