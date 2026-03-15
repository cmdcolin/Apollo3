/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { randomBytes } from 'node:crypto'
import fs from 'node:fs/promises'

import type { JWTPayload } from '@apollo-annotation/shared'
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { JwtService } from '@nestjs/jwt'
import type { Request } from 'express'
import type { Profile as GoogleProfile } from 'passport-google-oauth20'

import { CreateUserDto } from '../users/dto/create-user.dto.js'
import { UsersService } from '../users/users.service.js'
import {
  GUEST_USER_EMAIL,
  GUEST_USER_NAME,
  ROOT_USER_EMAIL,
} from '../utils/constants.js'
import { Role } from '../utils/role/role.enum.js'
import type { Profile as MicrosoftProfile } from '../utils/strategies/microsoft.strategy.js'

export interface RequestWithUserToken extends Request {
  user: { token: string }
}

interface ConfigValues {
  MICROSOFT_CLIENT_ID?: string
  MICROSOFT_CLIENT_ID_FILE?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_ID_FILE?: string
  ALLOW_GUEST_USER: boolean
  DEFAULT_NEW_USER_ROLE: Role
  ROOT_USER_PASSWORD: string
}

const ROOT_USER_NAME = 'root'

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name)
  private defaultNewUserRole: Role
  private setupToken: string | undefined

  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<ConfigValues, true>,
  ) {
    this.defaultNewUserRole = configService.get('DEFAULT_NEW_USER_ROLE', {
      infer: true,
    })
  }

  async generateSetupTokenIfNeeded() {
    const hasAdmin = await this.hasRealAdmin()
    if (!hasAdmin && !this.setupToken) {
      this.setupToken = randomBytes(32).toString('hex')
      this.logger.log(
        '========================================================',
      )
      this.logger.log(
        'No admin user found. Use the following URL to set up the',
      )
      this.logger.log('first admin account:')
      this.logger.log('')
      this.logger.log(`  /auth/setup?token=${this.setupToken}`)
      this.logger.log('')
      this.logger.log(
        '========================================================',
      )
    }
    return this.setupToken
  }

  validateAndActivateSetup(token: string) {
    if (!this.setupToken || token !== this.setupToken) {
      return false
    }
    this.setupActive = true
    return true
  }

  private setupActive = false

  private consumeSetup() {
    this.setupActive = false
    this.setupToken = undefined
  }

  private async hasRealAdmin() {
    const users = await this.usersService.findAll()
    return users.some(
      (u) =>
        u.role === Role.Admin &&
        u.email !== 'root_user' &&
        u.email !== 'guest_user',
    )
  }

  handleRedirect(req: RequestWithUserToken) {
    if (!req.user) {
      throw new BadRequestException()
    }

    const { redirect_uri } = (
      req.authInfo as { state: { redirect_uri: string } }
    ).state
    const url = new URL(redirect_uri)
    const searchParams = new URLSearchParams({ access_token: req.user.token })
    url.search = searchParams.toString()
    return { url: url.toString() }
  }

  async getLoginTypes() {
    const loginTypes: string[] = []
    let microsoftClientID = this.configService.get('MICROSOFT_CLIENT_ID', {
      infer: true,
    })
    if (!microsoftClientID) {
      const clientIDFile = this.configService.get('MICROSOFT_CLIENT_ID_FILE', {
        infer: true,
      })
      microsoftClientID =
        clientIDFile && (await fs.readFile(clientIDFile, 'utf8'))
      microsoftClientID = clientIDFile?.trim()
    }
    let googleClientID = this.configService.get('GOOGLE_CLIENT_ID', {
      infer: true,
    })
    if (!googleClientID) {
      const clientIDFile = this.configService.get('GOOGLE_CLIENT_ID_FILE', {
        infer: true,
      })
      googleClientID = clientIDFile && (await fs.readFile(clientIDFile, 'utf8'))
      googleClientID = clientIDFile?.trim()
    }
    const allowGuestUser = this.configService.get('ALLOW_GUEST_USER', {
      infer: true,
    })
    if (microsoftClientID) {
      loginTypes.push('microsoft')
    }
    if (googleClientID) {
      loginTypes.push('google')
    }
    if (allowGuestUser) {
      loginTypes.push('guest')
    }
    return loginTypes
  }

  /**
   * Log in with google
   * @param profile - profile
   * @returns Return either token with HttpResponse status 'HttpStatus.OK' OR null with 'HttpStatus.UNAUTHORIZED'
   */
  async googleLogin(profile: GoogleProfile) {
    if (!profile._json.email) {
      throw new UnauthorizedException('No email provided')
    }
    const { email, name } = profile._json
    return this.logIn(name ?? 'N/A', email)
  }

  /**
   * Log in with microsoft
   * @param profile - profile
   * @returns Return either token with HttpResponse status 'HttpStatus.OK' OR null with 'HttpStatus.UNAUTHORIZED'
   */
  async microsoftLogin(profile: MicrosoftProfile) {
    const [email] = profile.emails
    if (!email) {
      throw new UnauthorizedException('No email provided')
    }
    const { displayName } = profile
    return this.logIn(displayName, email.value)
  }

  /**
   * Log in as a guest
   * @returns Return either token with HttpResponse status 'HttpStatus.OK' OR null with 'HttpStatus.UNAUTHORIZED'
   */
  async guestLogin() {
    const allowGuestUser = this.configService.get('ALLOW_GUEST_USER', {
      infer: true,
    })
    if (allowGuestUser) {
      return this.logIn(GUEST_USER_NAME, GUEST_USER_EMAIL)
    }
    throw new UnauthorizedException('Guest users are not allowed')
  }

  async rootLogin(password: string) {
    if (password === this.configService.get('ROOT_USER_PASSWORD')) {
      return this.logIn(ROOT_USER_NAME, ROOT_USER_EMAIL)
    }
    throw new UnauthorizedException('Invalid password for ROOT user')
  }

  /**
   * Log in
   * @param name - User's display name
   * @param email - User's email
   * @returns Return token with HttpResponse status 'HttpStatus.OK'
   */
  async logIn(name: string, email: string) {
    let user = await this.usersService.findByEmail(email)
    if (!user) {
      let newUserRole = this.defaultNewUserRole
      const isRootUser = name === ROOT_USER_NAME && email === ROOT_USER_EMAIL
      if (isRootUser) {
        newUserRole = Role.Admin
      } else if (this.setupActive) {
        newUserRole = Role.Admin
        this.consumeSetup()
        this.logger.log(`Setup complete: ${email} promoted to admin`)
      }
      const newUser: CreateUserDto = {
        email,
        username: name,
        role: newUserRole,
      }
      user = await this.usersService.addNew(newUser)
    } else if (user.role === 'none' && this.setupActive) {
      await this.usersService.updateRole(user._id, Role.Admin)
      user = { ...user, role: Role.Admin }
      this.consumeSetup()
      this.logger.log(`Setup complete: ${email} promoted to admin`)
    }
    this.logger.debug(`User found: ${JSON.stringify(user)}`)

    const payload: JWTPayload = {
      username: user.username,
      email: user.email,
      role: user.role,
      id: String(user._id),
    }
    // Return token with SUCCESS status
    const returnToken = this.jwtService.sign(payload)
    this.logger.debug(
      `First time login successful. Apollo token: ${JSON.stringify(
        returnToken,
      )}`,
    )
    return { token: returnToken }
  }
}
