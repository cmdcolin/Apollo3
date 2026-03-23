import type { AnalysisJobRow } from '@apollo-annotation/common'

import type { DatabaseService } from '../mikro-orm/database.service.js'

export interface RunContext {
  job: AnalysisJobRow
  db: DatabaseService
  signal: AbortSignal
  updateMetadata(metadata: Record<string, unknown>): Promise<void>
}

export interface BuildDbContext {
  assemblyId: string
  dbName: string
  params: Record<string, unknown>
  db: DatabaseService
}

export interface AnalysisRunner {
  readonly tool: string

  isInstalled(): Promise<boolean>

  run(context: RunContext): Promise<unknown>

  buildDb?(context: BuildDbContext): Promise<{ dbPath: string }>

  getConfig?(): Record<string, unknown>
}
