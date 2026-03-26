import type { Role } from '../../utils/role/role.enum.js'

export class CreateUserDto {
  readonly email: string
  readonly username: string
  role?: Role
  pendingApproval?: boolean
}
