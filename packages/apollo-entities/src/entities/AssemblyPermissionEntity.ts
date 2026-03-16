import { defineEntity, p } from '@mikro-orm/core'

import { AssemblyEntity } from './AssemblyEntity.js'
import { UserEntity } from './UserEntity.js'

export enum AssemblyRole {
  ADMIN = 'admin',
  USER = 'user',
  READ_ONLY = 'readOnly',
}

export const AssemblyPermissionEntity = defineEntity({
  name: 'AssemblyPermissionEntity',
  tableName: 'assembly_permission',
  properties: {
    _id: p.string().primary(),
    user: () => p.manyToOne(UserEntity).deleteRule('cascade'),
    assembly: () => p.manyToOne(AssemblyEntity).deleteRule('cascade'),
    role: p.enum(() => AssemblyRole),
  },
  indexes: [{ properties: ['user', 'assembly'], options: { unique: true } }],
})
