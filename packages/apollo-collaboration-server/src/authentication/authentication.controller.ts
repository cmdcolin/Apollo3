import { randomBytes } from 'node:crypto'

import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'

import { Public } from './roles.guard.js'
import { AUTH_COOKIE_NAME } from './auth-cookie.js'

import { COOKIE_BASE, COOKIE_OPTIONS } from './auth-cookie.js'
import { AuthenticationService } from './authentication.service.js'
import { OidcService } from './oidc.service.js'

@Public()
@Controller('auth')
export class AuthenticationController {
  private readonly logger = new Logger(AuthenticationController.name)

  constructor(
    @Inject(AuthenticationService)
    private readonly authService: AuthenticationService,
    @Inject(OidcService)
    private readonly oidcService: OidcService,
  ) {}

  @Get('setup')
  @Redirect('/?setup=active')
  setupAdmin(@Query('token') token: string) {
    if (!token || !this.authService.validateAndActivateSetup(token)) {
      throw new BadRequestException('Invalid or expired setup token')
    }
    this.logger.log('Setup mode activated — next login will become admin')
    return { url: '/?setup=active' }
  }

  @Get('setup-active')
  isSetupActive() {
    return { active: this.authService.isSetupActive() }
  }

  @Get('types')
  getLoginTypes() {
    return this.authService.getLoginTypes()
  }

  // --- Generic OIDC login ---

  @Get('oidc/:provider')
  @Redirect()
  oidcLogin(
    @Param('provider') providerName: string,
    @Query('redirect_uri') redirectUri: string | undefined,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provider = this.oidcService.getProvider(providerName)
    if (!provider) {
      throw new BadRequestException(`Unknown OIDC provider "${providerName}"`)
    }
    const serverUrl = this.authService.getServerUrl()
    const base = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`
    const callbackUrl = `${base}auth/oidc/${providerName}/callback`

    const state = randomBytes(32).toString('hex')
    const session = req.session as Record<string, unknown>
    session.oidcState = state
    session.oidcRedirectUri = redirectUri

    const authUrl = this.oidcService.buildAuthorizationUrl(
      provider,
      callbackUrl,
      state,
    )
    return { url: authUrl.href }
  }

  @Get('oidc/:provider/callback')
  @Redirect()
  async oidcCallback(
    @Param('provider') providerName: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const provider = this.oidcService.getProvider(providerName)
    if (!provider) {
      throw new BadRequestException(`Unknown OIDC provider "${providerName}"`)
    }

    const session = req.session as Record<string, unknown>
    const expectedState = session.oidcState as string | undefined
    if (!expectedState) {
      throw new BadRequestException('Missing OIDC session state')
    }
    delete session.oidcState

    const serverUrl = this.authService.getServerUrl()
    const base = serverUrl.endsWith('/') ? serverUrl : `${serverUrl}/`
    const callbackUrl = new URL(
      `auth/oidc/${providerName}/callback`,
      base,
    )
    callbackUrl.search = new URL(req.url, base).search

    const { email, name } = await this.oidcService.handleCallback(
      provider,
      callbackUrl,
      expectedState,
    )
    const result = await this.authService.logIn(name, email)
    res.cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS)

    const redirectUri = session.oidcRedirectUri as string | undefined
    delete session.oidcRedirectUri

    const url = redirectUri
      ? this.authService.getSafeRedirectUrl(redirectUri)
      : serverUrl
    return { url }
  }

  // --- Root password login ---

  @Post('root')
  @Throttle({ default: { ttl: 60_000, limit: 100 } })
  async rootLogin(
    @Body() { password }: { password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.rootLogin(password)
    res.cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS)
    return result
  }

  @Get('logout')
  @Redirect('/')
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, COOKIE_BASE)
  }
}
