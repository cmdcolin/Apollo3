import { defineEntity, p } from '@mikro-orm/core'

export enum BlastJobStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  READY = 'ready',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export const BlastJobEntity = defineEntity({
  name: 'BlastJobEntity',
  tableName: 'blast_job',
  properties: {
    _id: p.string().primary(),
    status: p.enum(() => BlastJobStatus).default(BlastJobStatus.PENDING),
    program: p.string(),
    database: p.string(),
    query: p.text(),
    ncbiRid: p.string().nullable(),
    results: p.json<unknown>().nullable(),
    error: p.string().nullable(),
    createdBy: p.string().nullable(),
    createdAt: p.date().default('now'),
    startedAt: p.date().nullable(),
  },
  indexes: [{ properties: ['status'] }],
})
