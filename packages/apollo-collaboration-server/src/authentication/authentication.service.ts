import { randomBytes } from 'node:crypto'

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
import bcrypt from 'bcryptjs'

import type { CreateUserDto } from '../users/dto/create-user.dto.js'
import { UsersService } from '../users/users.service.js'
import { Role } from './role.enum.js'

import { OidcService } from './oidc.service.js'
import { safeRedirectUrl } from './redirect.js'

function validatePassword(password: string) {
  if (password.length < 8) {
    throw new BadRequestException('Password must be at least 8 characters')
  }
  if (password.length > 72) {
    throw new BadRequestException(
      'Password must be at most 72 characters (bcrypt limit)',
    )
  }
}

interface ConfigValues {
  URL: string
  ALLOWED_REDIRECT_ORIGINS?: string
  DEFAULT_NEW_USER_ROLE: Role
  ALLOW_PASSWORD_LOGIN: boolean
}

@Injectable()
export class AuthenticationService {
  private readonly logger = new Logger(AuthenticationService.name)
  private defaultNewUserRole: Role
  private setupToken: string | undefined

  private readonly allowedRedirectOrigins: string[]

  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(JwtService) private readonly jwtService: JwtService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<ConfigValues, true>,
    @Inject(OidcService) private readonly oidcService: OidcService,
  ) {
    const raw = configService.get('ALLOWED_REDIRECT_ORIGINS', { infer: true })
    this.allowedRedirectOrigins = raw
      ? raw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
    this.defaultNewUserRole = configService.get('DEFAULT_NEW_USER_ROLE', {
      infer: true,
    })
  }

  async generateSetupTokenIfNeeded() {
    const hasAdmin = await this.hasRealAdmin()
    if (!hasAdmin && !this.setupToken) {
      this.setupToken = randomBytes(32).toString('hex')
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

  isSetupActive() {
    return this.setupActive
  }

  private consumeSetup() {
    this.setupActive = false
    this.setupToken = undefined
  }

  private async hasRealAdmin() {
    const users = await this.usersService.findAll()
    return users.some((u) => u.role === Role.Admin)
  }

  getServerUrl() {
    return this.configService.get('URL', { infer: true })
  }

  getSafeRedirectUrl(redirectUri: string) {
    const serverUrl = this.getServerUrl()
    const serverOrigin = new URL(serverUrl).origin
    const allowed = new Set([serverOrigin, ...this.allowedRedirectOrigins])
    let inputOrigin: string | undefined
    try {
      inputOrigin = new URL(redirectUri).origin
    } catch {
      // invalid URL — will fall back to server root
    }
    const result = safeRedirectUrl(
      serverUrl,
      redirectUri,
      this.allowedRedirectOrigins,
    )
    if (inputOrigin && !allowed.has(inputOrigin)) {
      this.logger.warn(
        `Blocked redirect to external origin: ${inputOrigin} (expected ${serverOrigin})`,
      )
    }
    return result.toString()
  }

  getLoginTypes() {
    return {
      oidc: this.oidcService.getProviderNames(),
      passwordLogin: this.configService.get('ALLOW_PASSWORD_LOGIN', {
        infer: true,
      }),
    }
  }

  async setupAccount(email: string, username: string, password: string) {
    if (!this.setupActive) {
      throw new BadRequestException('Setup mode is not active')
    }
    validatePassword(password)
    const existing = await this.usersService.findByEmail(email)
    if (existing) {
      throw new BadRequestException('A user with that email already exists')
    }
    const passwordHash = await bcrypt.hash(password, 10)
    const user = await this.usersService.addNew({
      email,
      username,
      role: Role.Admin,
      passwordHash,
    })
    this.consumeSetup()
    this.logger.log(`Setup complete: ${email} promoted to admin`)
    const payload: JWTPayload = {
      username: user.username,
      email: user.email,
      role: user.role,
      id: user._id,
    }
    const returnToken = this.jwtService.sign(payload)
    return { token: returnToken }
  }

  async passwordLogin(email: string, password: string) {
    const user = await this.usersService.findByEmail(email)
    if (!user?.passwordHash) {
      throw new UnauthorizedException('Invalid email or password')
    }
    const valid = await bcrypt.compare(password, user.passwordHash)
    if (!valid) {
      throw new UnauthorizedException('Invalid email or password')
    }
    const payload: JWTPayload = {
      username: user.username,
      email: user.email,
      role: user.role,
      id: user._id,
    }
    const returnToken = this.jwtService.sign(payload)
    return { token: returnToken }
  }

  async acceptInvite(token: string, password: string) {
    if (!token) {
      throw new BadRequestException('Invalid or expired invite link')
    }
    const user = await this.usersService.findByInviteToken(token)
    if (!user) {
      throw new BadRequestException('Invalid or expired invite link')
    }
    const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
    if (
      user.inviteTokenCreatedAt &&
      Date.now() - user.inviteTokenCreatedAt.getTime() > INVITE_TTL_MS
    ) {
      throw new BadRequestException(
        'Invite link has expired. Ask an admin to re-invite you.',
      )
    }
    validatePassword(password)
    const passwordHash = await bcrypt.hash(password, 10)
    await this.usersService.setPassword(user._id, passwordHash)
    await this.usersService.clearInviteToken(user._id)
    const payload: JWTPayload = {
      username: user.username,
      email: user.email,
      role: user.role,
      id: user._id,
    }
    const returnToken = this.jwtService.sign(payload)
    return { token: returnToken }
  }

  async logIn(name: string, email: string) {
    let user = await this.usersService.findByEmail(email)
    if (!user) {
      let newUserRole = this.defaultNewUserRole
      if (this.setupActive) {
        newUserRole = Role.Admin
        this.consumeSetup()
        this.logger.log(`Setup complete: ${email} promoted to admin`)
      }
      const isDefaultRole = newUserRole === this.defaultNewUserRole
      const newUser: CreateUserDto = {
        email,
        username: name,
        role: newUserRole,
        pendingApproval: isDefaultRole,
      }
      user = await this.usersService.addNew(newUser)
    } else if (user.role === Role.None && this.setupActive) {
      await this.usersService.updateRole(user._id, Role.Admin)
      user = { ...user, role: Role.Admin }
      this.consumeSetup()
      this.logger.log(`Setup complete: ${email} promoted to admin`)
    }
    this.logger.debug(`User logged in: ${user.email} (role: ${user.role})`)

    const payload: JWTPayload = {
      username: user.username,
      email: user.email,
      role: user.role,
      id: user._id,
    }
    const returnToken = this.jwtService.sign(payload)
    return { token: returnToken }
  }
}
