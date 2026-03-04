import type { UserRepository, UserRow } from '@apollo-annotation/common'
import { EntityManager } from '@mikro-orm/core'

import { UserEntity, UserRole } from '../entities/UserEntity'

function toRow(entity: UserEntity): UserRow {
  return {
    _id: entity._id,
    username: entity.username,
    email: entity.email,
    role: entity.role as UserRow['role'],
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  }
}

export class MikroOrmUserRepository implements UserRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(UserEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return undefined
  }

  async findByEmail(email: string) {
    const entity = await this.em.findOne(UserEntity, { email })
    if (entity) {
      return toRow(entity)
    }
    return undefined
  }

  async create(row: UserRow) {
    const entity = this.em.create(UserEntity, {
      _id: row._id,
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    })
    await this.em.persistAndFlush(entity)
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<UserRow, '_id'>>) {
    const entity = await this.em.findOne(UserEntity, { _id: id })
    if (!entity) {
      return undefined
    }
    this.em.assign(entity, data)
    await this.em.flush()
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(UserEntity, { _id: id })
    if (!entity) {
      return false
    }
    await this.em.removeAndFlush(entity)
    return true
  }
}
