export interface AssemblyPermissionRow {
  _id: string
  user: string
  assembly: string
  role: 'admin' | 'user' | 'readOnly'
}

export interface AssemblyPermissionRepository {
  findById(id: string): Promise<AssemblyPermissionRow | undefined>
  findByUser(userId: string): Promise<AssemblyPermissionRow[]>
  findByAssembly(assemblyId: string): Promise<AssemblyPermissionRow[]>
  findByUserAndAssembly(
    userId: string,
    assemblyId: string,
  ): Promise<AssemblyPermissionRow | undefined>
  create(row: AssemblyPermissionRow): Promise<AssemblyPermissionRow>
  deleteById(id: string): Promise<boolean>
  deleteByUserAndAssembly(userId: string, assemblyId: string): Promise<boolean>
  deleteByAssembly(assemblyId: string): Promise<void>
}
