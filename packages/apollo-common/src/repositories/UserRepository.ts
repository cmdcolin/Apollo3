export interface UserRow {
  _id: string
  username: string
  email: string
  role: 'readOnly' | 'admin' | 'user' | 'none'
  createdAt?: Date
  updatedAt?: Date
}

export interface UserRepository {
  findById(id: string): Promise<UserRow | undefined>
  findByEmail(email: string): Promise<UserRow | undefined>
  create(row: UserRow): Promise<UserRow>
  deleteById(id: string): Promise<boolean>
}
