import { User as UserSchema, UserDocument } from '@apollo-annotation/schemas'
import {
  DecodedJWT,
  RequestUserInformationMessage,
  UserLocationMessage,
  makeUserSessionId,
} from '@apollo-annotation/shared'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { ObjectId } from 'mongodb'
import { Model } from 'mongoose'

import { MessagesGateway } from '../messages/messages.gateway'
import { DatabaseService } from '../mikro-orm/database.service'
import { GUEST_USER_EMAIL, GUEST_USER_NAME } from '../utils/constants'
import { Role } from '../utils/role/role.enum'

import { CreateUserDto, UserLocationDto } from './dto/create-user.dto'

export interface User {
  email: string
  username: string
  password: string
}

@Injectable()
export class UsersService {
  private readonly users: User[]

  constructor(
    @Optional()
    @InjectModel(UserSchema.name)
    private readonly userModel: Model<UserDocument>,
    private readonly messagesGateway: MessagesGateway,
    private readonly configService: ConfigService<
      {
        BROADCAST_USER_LOCATION: boolean
        ALLOW_GUEST_USER: boolean
        GUEST_USER_ROLE: Role
      },
      true
    >,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(UsersService.name)

  async findById(id: string) {
    if (this.db.useV2Backend) {
      return this.db.user.findById(id)
    }
    return this.userModel.findById(id).exec()
  }

  async findByUsername(username: string) {
    if (this.db.useV2Backend) {
      const users = await this.db.user.findAll()
      return users.find((u) => u.username === username)
    }
    return this.userModel.findOne({ username }).exec()
  }

  async findByEmail(email: string) {
    if (this.db.useV2Backend) {
      return this.db.user.findByEmail(email)
    }
    return this.userModel.findOne({ email }).exec()
  }

  async findByRole(role: Role) {
    if (this.db.useV2Backend) {
      return this.db.user.findByRole(role)
    }
    return this.userModel.findOne({ role }).sort('createdAt').exec()
  }

  async findGuest() {
    return this.findByEmail(GUEST_USER_EMAIL)
  }

  async findAll() {
    if (this.db.useV2Backend) {
      return this.db.user.findAll()
    }
    return this.userModel.find().exec()
  }

  async addNew(user: CreateUserDto) {
    if (this.db.useV2Backend) {
      return this.db.user.create({
        _id: new ObjectId().toHexString(),
        email: user.email,
        username: user.username,
        role: user.role ?? 'none',
      })
    }
    return this.userModel.create(user)
  }

  async getCount() {
    if (this.db.useV2Backend) {
      return this.db.user.count()
    }
    return this.userModel.count().exec()
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
    if (this.db.useV2Backend) {
      return this.db.user.deleteByEmail(GUEST_USER_EMAIL)
    }
    return this.userModel.findOneAndDelete({ email: GUEST_USER_EMAIL }).exec()
  }

  /**
   * If BROADCAST_USER_LOCATION -environment variable is set to true then broadcast user's location to 'USER_LOCATION' -channel
   * @param userLocation - user's location information
   * @param token - user's token, email will be decoded from the token
   */
  broadcastLocation(userLocations: UserLocationDto[], user: DecodedJWT) {
    const broadcast = this.configService.get('BROADCAST_USER_LOCATION', {
      infer: true,
    })
    const channel = 'USER_LOCATION'

    if (!broadcast) {
      return
    }
    const { email, username: userName } = user
    const userSessionId = makeUserSessionId(user)
    const msg: UserLocationMessage = {
      locations: userLocations.map((location) => ({
        // eslint-disable-next-line @typescript-eslint/no-misused-spread
        ...location,
        start: Number(location.start),
        end: Number(location.end),
      })),
      channel,
      userName,
      userSessionId,
    }
    this.logger.debug(
      `Broadcasting user ${JSON.stringify(
        email,
      )} location to channel "${channel}", the message is "${JSON.stringify(
        msg,
      )}"`,
    )
    return this.messagesGateway.create(channel, msg)
  }

  /**
   * Request other users's current location after user has successfully logged in
   * @param token - user's token
   */
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
