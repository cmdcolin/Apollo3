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
  Req,
  Res,
} from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'

import { Public } from './roles.guard.js'
import { AUTH_COOKIE_NAME, COOKIE_BASE, COOKIE_OPTIONS } from './auth-cookie.js'
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
  setupAdmin(@Query('token') token: string, @Res() res: Response) {
    if (!token || !this.authService.validateAndActivateSetup(token)) {
      throw new BadRequestException('Invalid or expired setup token')
    }
    this.logger.log('Setup mode activated — next login will become admin')
    res.redirect('/?setup=active')
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
  oidcLogin(
    @Param('provider') providerName: string,
    @Query('redirect_uri') redirectUri: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const provider = this.oidcService.getProvider(providerName)
    if (!provider) {
      throw new BadRequestException(`Unknown OIDC provider "${providerName}"`)
    }
    const baseUrl = this.authService.getServerUrl()
    const callbackUrl = `${baseUrl}auth/oidc/${providerName}/callback`

    const state = randomBytes(32).toString('hex')
    const session = req.session as Record<string, unknown>
    session.oidcState = state
    session.oidcRedirectUri = redirectUri

    const authUrl = this.oidcService.buildAuthorizationUrl(
      provider,
      callbackUrl,
      state,
    )
    res.redirect(authUrl.href)
  }

  @Get('oidc/:provider/callback')
  async oidcCallback(
    @Param('provider') providerName: string,
    @Req() req: Request,
    @Res() res: Response,
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

    const baseUrl = this.authService.getServerUrl()
    const callbackUrl = new URL(
      `auth/oidc/${providerName}/callback`,
      baseUrl,
    )
    callbackUrl.search = new URL(req.url, baseUrl).search

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
      : baseUrl
    res.redirect(url)
  }

  // --- Setup account (first admin) ---

  @Post('setup-account')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  async setupAccount(
    @Body()
    { email, username, password }: { email: string; username: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.setupAccount(email, username, password)
    res.cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS)
    return result
  }

  // --- Password login ---

  @Post('login')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async passwordLogin(
    @Body() { email, password }: { email: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.passwordLogin(email, password)
    res.cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS)
    return result
  }

  // --- Accept invite ---

  @Post('accept-invite')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  async acceptInvite(
    @Body() { token, password }: { token: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.acceptInvite(token, password)
    res.cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS)
    return result
  }

  @Get('logout')
  logout(@Res() res: Response) {
    res.clearCookie(AUTH_COOKIE_NAME, COOKIE_BASE)
    res.redirect('/')
  }
}
