export interface UserRow {
  _id: string
  username: string
  email: string
  role: 'readOnly' | 'admin' | 'user' | 'none'
  pendingApproval?: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface UserRepository {
  findById(id: string): Promise<UserRow | undefined>
  findByEmail(email: string): Promise<UserRow | undefined>
  findByRole(role: string): Promise<UserRow | undefined>
  findAll(): Promise<UserRow[]>
  count(): Promise<number>
  create(row: UserRow): Promise<UserRow>
  deleteById(id: string): Promise<boolean>
  deleteByEmail(email: string): Promise<boolean>
  updateById(
    id: string,
    data: Partial<Omit<UserRow, '_id'>>,
  ): Promise<UserRow | undefined>
}
