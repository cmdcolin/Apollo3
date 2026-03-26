import type { UserRepository, UserRow } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { UserEntity, type UserRole } from '../entities/UserEntity.js'

function toRow(entity: InferEntity<typeof UserEntity>): UserRow {
  return {
    _id: entity._id,
    username: entity.username,
    email: entity.email,
    role: entity.role as UserRow['role'],
    pendingApproval: entity.pendingApproval ?? undefined,
    createdAt: entity.createdAt ?? undefined,
    updatedAt: entity.updatedAt ?? undefined,
  }
}

export class MikroOrmUserRepository implements UserRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(UserEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByEmail(email: string) {
    const entity = await this.em.findOne(UserEntity, { email })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findByRole(role: string) {
    const entity = await this.em.findOne(
      UserEntity,
      { role: role as UserRole },
      { orderBy: { createdAt: 'asc' } },
    )
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findAll() {
    const entities = await this.em.find(UserEntity, {}, {})
    return entities.map((x) => toRow(x))
  }

  async count() {
    return this.em.count(UserEntity)
  }

  async create(row: UserRow) {
    const entity = this.em.create(UserEntity, {
      _id: row._id,
      username: row.username,
      email: row.email,
      role: row.role as UserRole,
      pendingApproval: row.pendingApproval ?? null,
      createdAt: row.createdAt ?? new Date(),
      updatedAt: row.updatedAt ?? new Date(),
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async updateById(id: string, data: Partial<Omit<UserRow, '_id'>>) {
    const entity = await this.em.findOne(UserEntity, { _id: id })
    if (!entity) {
      return
    }
    const { role, pendingApproval, ...rest } = data
    if (role !== undefined) {
      entity.role = role as UserRole
    }
    if (pendingApproval !== undefined) {
      entity.pendingApproval = pendingApproval
    }
    this.em.assign(entity, rest)
    await this.em.flush()
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(UserEntity, { _id: id })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }

  async deleteByEmail(email: string) {
    const entity = await this.em.findOne(UserEntity, { email })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }
}
