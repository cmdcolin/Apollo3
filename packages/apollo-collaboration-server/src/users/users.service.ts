import { randomBytes } from 'node:crypto'

import {
  type DecodedJWT,
  type RequestUserInformationMessage,
  type UserLocationMessage,
  makeUserSessionId,
} from '@apollo-annotation/shared'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { MessagesGateway } from '../messages/messages.gateway.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { GUEST_USER_EMAIL, GUEST_USER_NAME } from '../utils/constants.js'
import { Role } from '../utils/role/role.enum.js'

import { CreateUserDto, UserLocationDto } from './dto/create-user.dto.js'

export interface User {
  email: string
  username: string
  password: string
}

@Injectable()
export class UsersService {
  private readonly users: User[]

  constructor(
    @Inject(MessagesGateway) private readonly messagesGateway: MessagesGateway,
    @Inject(ConfigService)
    private readonly configService: ConfigService<
      {
        BROADCAST_USER_LOCATION: boolean
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

  broadcastLocation(location: UserLocationDto | null, user: DecodedJWT) {
    const broadcast = this.configService.get('BROADCAST_USER_LOCATION', {
      infer: true,
    })
    if (!broadcast) {
      return
    }
    const channel = 'USER_LOCATION'
    const { username: userName } = user
    const userSessionId = makeUserSessionId(user)
    const locations = location
      ? [
          {
            assemblyId: location.assemblyId,
            refSeq: location.refSeq,
            start: Number(location.start),
            end: Number(location.end),
          },
        ]
      : []
    const msg: UserLocationMessage = {
      locations,
      channel,
      userName,
      userSessionId,
    }
    return this.messagesGateway.create(channel, msg)
  }

  requestUsersLocations(user: DecodedJWT) {
    const channel = 'REQUEST_INFORMATION'
    const userSessionId = makeUserSessionId(user)
    const { username: userName } = user
    const msg: RequestUserInformationMessage = {
      channel,
      userName,
      userSessionId,
      reqType: 'CURRENT_LOCATION',
    }
    this.logger.debug(
      `*** Broadcasting request to resend users's current locations. Channel "${channel}", the message is "${JSON.stringify(
        msg,
      )}"`,
    )
    return this.messagesGateway.create(channel, msg)
  }
}
