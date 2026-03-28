import type { Role } from '../../authentication/role.enum.js'

export class CreateUserDto {
  readonly email: string
  readonly username: string
  role?: Role
  pendingApproval?: boolean
}
