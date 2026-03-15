import { randomBytes } from 'node:crypto'

import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { DatabaseService } from '../mikro-orm/database.service.js'
import { GUEST_USER_EMAIL, GUEST_USER_NAME } from '../utils/constants.js'
import { Role } from '../utils/role/role.enum.js'

import { CreateUserDto } from './dto/create-user.dto.js'

@Injectable()
export class UsersService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<
      {
        ALLOW_GUEST_USER: boolean
        GUEST_USER_ROLE: Role
      },
      true
    >,
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

  async findGuest() {
    return this.findByEmail(GUEST_USER_EMAIL)
  }

  async findAll() {
    return this.db.user.findAll()
  }

  async addNew(user: CreateUserDto) {
    return this.db.user.create({
      _id: randomBytes(12).toString('hex'),
      email: user.email,
      username: user.username,
      role: user.role ?? 'none',
    })
  }

  async updateRole(id: string, role: 'admin' | 'user' | 'readOnly' | 'none') {
    return this.db.user.updateById(id, { role })
  }

  async getCount() {
    return this.db.user.count()
  }

  async bootstrapDB() {
    const allowGuestUser = this.configService.get('ALLOW_GUEST_USER', {
      infer: true,
    })
    const guestUserRole = this.configService.get('GUEST_USER_ROLE', {
      infer: true,
    })
    const guestUser = await this.findByEmail(GUEST_USER_EMAIL)
    if (allowGuestUser) {
      if (guestUser) {
        return
      }
      return this.addNew({
        email: GUEST_USER_EMAIL,
        username: GUEST_USER_NAME,
        role: guestUserRole,
      })
    }
    if (!guestUser) {
      return
    }
    return this.db.user.deleteByEmail(GUEST_USER_EMAIL)
  }
}
