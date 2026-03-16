export interface TrackConfigRow {
  _id: string
  trackId: string
  assemblyIds: string[]
  config: Record<string, unknown>
  createdBy?: string
}

export interface TrackConfigRepository {
  findById(id: string): Promise<TrackConfigRow | undefined>
  findByTrackId(trackId: string): Promise<TrackConfigRow | undefined>
  findByAssemblyId(assemblyId: string): Promise<TrackConfigRow[]>
  findByAssemblyIds(assemblyIds: string[]): Promise<TrackConfigRow[]>
  findAll(): Promise<TrackConfigRow[]>
  create(row: TrackConfigRow): Promise<TrackConfigRow>
  updateById(
    id: string,
    data: Partial<Omit<TrackConfigRow, '_id'>>,
  ): Promise<TrackConfigRow | undefined>
  deleteById(id: string): Promise<boolean>
  removeAssemblyFromTracks(assemblyId: string): Promise<void>
}
