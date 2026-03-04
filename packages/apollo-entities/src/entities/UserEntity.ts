import { Entity, Enum, PrimaryKey, Property, Unique } from '@mikro-orm/core'

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  READ_ONLY = 'readOnly',
  NONE = 'none',
}

@Entity({ tableName: 'user' })
export class UserEntity {
  @PrimaryKey()
  _id!: string

  @Property()
  username!: string

  @Property()
  @Unique()
  email!: string

  @Enum(() => UserRole)
  role!: UserRole

  @Property({ nullable: true })
  createdAt?: Date

  @Property({ nullable: true, onUpdate: () => new Date() })
  updatedAt?: Date
}
