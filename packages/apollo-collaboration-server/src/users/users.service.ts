import { userId } from '@apollo-annotation/common'
import { Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'
import { Role } from '../utils/role/role.enum.js'

import type { CreateUserDto } from './dto/create-user.dto.js'

@Injectable()
export class UsersService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(UsersService.name)

  async findById(id: string) {
    return this.db.user.findById(id)
  }

  async findByUsername(username: string) {
    const users = await this.db.user.findAll()
    return users.find((u) => u.username === username)
  }

  async findByEmail(email: string) {
    return this.db.user.findByEmail(email)
  }

  async findByRole(role: Role) {
    return this.db.user.findByRole(role)
  }

  async findAll() {
    return this.db.user.findAll()
  }

  async addNew(user: CreateUserDto) {
    return this.db.user.create({
      _id: userId(),
      email: user.email,
      username: user.username,
      role: user.role ?? Role.None,
      pendingApproval: user.pendingApproval,
    })
  }

  async updateRole(id: string, role: Role) {
    return this.db.user.updateById(id, { role, pendingApproval: false })
  }

  async getPendingCount() {
    const all = await this.db.user.findAll()
    return all.filter((u) => u.pendingApproval === true).length
  }

  async remove(id: string) {
    return this.db.user.deleteById(id)
  }

  async getCount() {
    return this.db.user.count()
  }
}
