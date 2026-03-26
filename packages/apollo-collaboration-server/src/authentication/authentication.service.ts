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

import type { CreateUserDto } from '../users/dto/create-user.dto.js'
import { UsersService } from '../users/users.service.js'
import {
  GUEST_USER_EMAIL,
  GUEST_USER_NAME,
  ROOT_USER_EMAIL,
} from '../utils/constants.js'
import { Role } from '../utils/role/role.enum.js'
import type { Profile as MicrosoftProfile } from '../utils/strategies/microsoft.strategy.js'

import { safeRedirectUrl } from './redirect.js'

export interface RequestWithUserToken extends Request {
  user: { token: string }
}

interface ConfigValues {
  URL: string
  MICROSOFT_CLIENT_ID?: string
  MICROSOFT_CLIENT_ID_FILE?: string
  GOOGLE_CLIENT_ID?: string
  GOOGLE_CLIENT_ID_FILE?: string
  ALLOW_GUEST_USER: boolean
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
      (u) =>
        u.role === Role.Admin &&
        u.email !== ROOT_USER_EMAIL &&
        u.email !== GUEST_USER_EMAIL,
    )
  }

  getSafeRedirectUrl(redirectUri: string) {
    const serverUrl = this.configService.get('URL', { infer: true })
    const serverOrigin = new URL(serverUrl).origin
    let inputOrigin: string | undefined
    try {
      inputOrigin = new URL(redirectUri).origin
    } catch {
      // invalid URL — will fall back to server root
    }
    const result = safeRedirectUrl(serverUrl, redirectUri)
    if (inputOrigin && inputOrigin !== serverOrigin) {
      this.logger.warn(
        `Blocked redirect to external origin: ${inputOrigin} (expected ${serverOrigin})`,
      )
    }
    return result.toString()
  }

  handleRedirect(req: RequestWithUserToken) {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (!req.user) {
      throw new BadRequestException()
    }
    const authInfo = req.authInfo as
      | { state?: { redirect_uri?: string } }
      | undefined
    const redirectUri = authInfo?.state?.redirect_uri
    const serverUrl = this.configService.get('URL', { infer: true })
    const url = redirectUri
      ? safeRedirectUrl(serverUrl, redirectUri)
      : new URL(new URL(serverUrl).origin)
    url.searchParams.set('access_token', req.user.token)
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
      if (clientIDFile) {
        const content = await fs.readFile(clientIDFile, 'utf8')
        microsoftClientID = content.trim()
      }
    }
    let googleClientID = this.configService.get('GOOGLE_CLIENT_ID', {
      infer: true,
    })
    if (!googleClientID) {
      const clientIDFile = this.configService.get('GOOGLE_CLIENT_ID_FILE', {
        infer: true,
      })
      if (clientIDFile) {
        const googleContent = await fs.readFile(clientIDFile, 'utf8')
        googleClientID = googleContent.trim()
      }
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
    const allowRootUser = this.configService.get('ALLOW_ROOT_USER', {
      infer: true,
    })
    if (allowRootUser) {
      loginTypes.push('root')
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

  /**
   * Log in
   * @param name - User's display name
   * @param email - User's email
   * @returns Return token with HttpResponse status 'HttpStatus.OK'
   */
  async logIn(name: string, email: string) {
    const isGuestUser = email === GUEST_USER_EMAIL
    let user = await this.usersService.findByEmail(email)
    if (!user) {
      let newUserRole = this.defaultNewUserRole
      const isRootUser = name === ROOT_USER_NAME && email === ROOT_USER_EMAIL
      if (isRootUser) {
        newUserRole = Role.Admin
      } else if (this.setupActive && !isGuestUser) {
        newUserRole = Role.Admin
        this.consumeSetup()
        this.logger.log(`Setup complete: ${email} promoted to admin`)
      }
      const isDefaultRole = newUserRole === this.defaultNewUserRole
      const newUser: CreateUserDto = {
        email,
        username: name,
        role: newUserRole,
        pendingApproval: isDefaultRole && !isGuestUser && !isRootUser,
      }
      user = await this.usersService.addNew(newUser)
    } else if (user.role === Role.None && this.setupActive && !isGuestUser) {
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
