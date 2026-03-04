export interface CheckRow {
  _id: string
  name: string
  causes?: string[]
  isDefault?: boolean
  version?: number
  createdAt?: Date
  updatedAt?: Date
}

export interface CheckRepository {
  findDefaults(): Promise<CheckRow[]>
  findById(id: string): Promise<CheckRow | undefined>
  upsert(row: CheckRow): Promise<CheckRow>
}
