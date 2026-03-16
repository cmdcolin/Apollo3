import { defineEntity, p } from '@mikro-orm/core'

export enum TiberiusJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  READY = 'ready',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export const TiberiusJobEntity = defineEntity({
  name: 'TiberiusJobEntity',
  tableName: 'tiberius_job',
  properties: {
    _id: p.string().primary(),
    status: p.enum(() => TiberiusJobStatus).default(TiberiusJobStatus.PENDING),
    assemblyId: p.string(),
    refSeqId: p.string(),
    refSeqName: p.string(),
    start: p.number(),
    end: p.number(),
    trackConfigId: p.string().nullable(),
    error: p.string().nullable(),
    createdBy: p.string().nullable(),
    createdAt: p.date().default('now'),
    startedAt: p.date().nullable(),
  },
  indexes: [{ properties: ['status'] }, { properties: ['assemblyId'] }],
})
