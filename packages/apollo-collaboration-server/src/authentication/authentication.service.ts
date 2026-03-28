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

import type { CreateUserDto } from '../users/dto/create-user.dto.js'
import { UsersService } from '../users/users.service.js'
import { ROOT_USER_EMAIL } from './constants.js'
import { Role } from './role.enum.js'

import { OidcService } from './oidc.service.js'
import { safeRedirectUrl } from './redirect.js'

interface ConfigValues {
  URL: string
  ALLOWED_REDIRECT_ORIGINS?: string
  DEFAULT_NEW_USER_ROLE: Role
  ALLOW_ROOT_USER: boolean
  ROOT_USER_PASSWORD?: string
  ROOT_USER_PASSWORD_FILE?: string
}

const ROOT_USER_NAME = 'root'

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

  isSetupActive() {
    return this.setupActive
  }

  private consumeSetup() {
    this.setupActive = false
    this.setupToken = undefined
  }

  private async hasRealAdmin() {
    const users = await this.usersService.findAll()
    return users.some(
      (u) => u.role === Role.Admin && u.email !== ROOT_USER_EMAIL,
    )
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
      rootLogin: !!this.configService.get('ALLOW_ROOT_USER', { infer: true }),
    }
  }

  async rootLogin(password: string) {
    if (!this.configService.get('ALLOW_ROOT_USER', { infer: true })) {
      throw new UnauthorizedException('Root user login is disabled')
    }
    let rootPassword = this.configService.get('ROOT_USER_PASSWORD', {
      infer: true,
    })
    if (!rootPassword) {
      const passwordFile = this.configService.get('ROOT_USER_PASSWORD_FILE', {
        infer: true,
      })
      if (passwordFile) {
        const passwordContent = await fs.readFile(passwordFile, 'utf8')
        rootPassword = passwordContent.trim()
      }
    }
    if (rootPassword && password === rootPassword) {
      return this.logIn(ROOT_USER_NAME, ROOT_USER_EMAIL)
    }
    throw new UnauthorizedException('Invalid password for ROOT user')
  }

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
      const isDefaultRole = newUserRole === this.defaultNewUserRole
      const newUser: CreateUserDto = {
        email,
        username: name,
        role: newUserRole,
        pendingApproval: isDefaultRole && !isRootUser,
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
