import { defineEntity, p } from '@mikro-orm/core'

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  READ_ONLY = 'readOnly',
  NONE = 'none',
}

export const UserEntity = defineEntity({
  name: 'UserEntity',
  tableName: 'user',
  properties: {
    _id: p.string().primary(),
    username: p.string(),
    email: p.string().unique(),
    role: p.enum(() => UserRole),
    createdAt: p.datetime().nullable(),
    updatedAt: p
      .datetime()
      .nullable()
      .onUpdate(() => new Date()),
  },
})
