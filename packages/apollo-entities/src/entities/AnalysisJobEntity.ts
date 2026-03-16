import { defineEntity, p } from '@mikro-orm/core'

export enum AnalysisJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  READY = 'ready',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export const AnalysisJobEntity = defineEntity({
  name: 'AnalysisJobEntity',
  tableName: 'analysis_job',
  properties: {
    _id: p.string().primary(),
    status: p
      .enum(() => AnalysisJobStatus)
      .default(AnalysisJobStatus.PENDING),
    tool: p.string(),
    assemblyId: p.string().nullable(),
    params: p.json<Record<string, unknown>>().default('{}'),
    results: p.json<unknown>().nullable(),
    metadata: p.json<Record<string, unknown>>().nullable(),
    error: p.string().nullable(),
    createdBy: p.string().nullable(),
    createdAt: p.date().default('now'),
    startedAt: p.date().nullable(),
  },
  indexes: [{ properties: ['status'] }, { properties: ['tool'] }],
})
