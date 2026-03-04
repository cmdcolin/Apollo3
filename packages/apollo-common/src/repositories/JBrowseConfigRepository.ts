export interface JBrowseConfigRow {
  _id: string
  config: Record<string, unknown>
}

export interface JBrowseConfigRepository {
  findOne(): Promise<JBrowseConfigRow | undefined>
  upsert(row: JBrowseConfigRow): Promise<JBrowseConfigRow>
  deleteAll(): Promise<void>
}
