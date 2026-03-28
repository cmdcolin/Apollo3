export const Role = {
  Admin: 'admin',
  User: 'user',
  ReadOnly: 'readOnly',
  None: 'none',
} as const

export type Role = (typeof Role)[keyof typeof Role]

export const RoleInheritance: Record<Role, Role[]> = {
  [Role.None]: [Role.None],
  [Role.ReadOnly]: [Role.None, Role.ReadOnly],
  [Role.User]: [Role.None, Role.ReadOnly, Role.User],
  [Role.Admin]: [Role.None, Role.ReadOnly, Role.User, Role.Admin],
}
