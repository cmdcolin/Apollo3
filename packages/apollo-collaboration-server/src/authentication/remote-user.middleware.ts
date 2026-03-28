import { Inject, Injectable, Logger, type NestMiddleware } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { NextFunction, Request, Response } from 'express'

import { AUTH_COOKIE_NAME } from './auth-cookie.js'

import { COOKIE_OPTIONS } from './auth-cookie.js'
import { AuthenticationService } from './authentication.service.js'

interface RemoteUserConfig {
  REMOTE_USER_HEADER?: string
}

@Injectable()
export class RemoteUserMiddleware implements NestMiddleware {
  private readonly logger = new Logger(RemoteUserMiddleware.name)
  private readonly header: string | undefined

  constructor(
    @Inject(ConfigService)
    configService: ConfigService<RemoteUserConfig, true>,
    @Inject(AuthenticationService)
    private readonly authService: AuthenticationService,
  ) {
    this.header = configService.get('REMOTE_USER_HEADER', { infer: true })
    if (this.header) {
      this.logger.log(
        `Trusted header auth enabled: "${this.header}"`,
      )
    }
  }

  async use(req: Request, res: Response, next: NextFunction) {
    if (!this.header) {
      next()
      return
    }

    // If user already has a valid JWT cookie, skip
    const cookies = req.cookies as Record<string, string> | undefined
    if (cookies?.[AUTH_COOKIE_NAME]) {
      next()
      return
    }

    const remoteUser = req.headers[this.header.toLowerCase()]
    if (typeof remoteUser !== 'string' || !remoteUser) {
      next()
      return
    }

    // Auto-login: create user if needed and issue JWT
    const result = await this.authService.logIn(remoteUser, remoteUser)
    res.cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS)
    this.logger.debug(`Remote user authenticated: ${remoteUser}`)

    next()
  }
}
