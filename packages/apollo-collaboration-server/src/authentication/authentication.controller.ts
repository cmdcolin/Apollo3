/* eslint-disable @typescript-eslint/require-await */
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Post,
  Query,
  Redirect,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common'
import type { Response } from 'express'

import { GoogleAuthGuard } from '../utils/google.guard.js'
import { MicrosoftAuthGuard } from '../utils/microsoft.guard.js'
import { Public } from '../utils/roles.guard.js'
import { AUTH_COOKIE_NAME } from '../utils/strategies/jwt.strategy.js'

import {
  AuthenticationService,
  type RequestWithUserToken,
} from './authentication.service.js'

const isProduction = process.env.NODE_ENV === 'production'

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: isProduction,
  path: '/',
}

const COOKIE_OPTIONS = {
  ...COOKIE_BASE,
  maxAge: 24 * 60 * 60 * 1000,
}

@Public()
@Controller('auth')
export class AuthenticationController {
  private readonly logger = new Logger(AuthenticationController.name)

  constructor(
    @Inject(AuthenticationService)
    private readonly authService: AuthenticationService,
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

  @Get('login')
  @Redirect()
  handleLogin(
    @Query('type') type: string,
    @Query('redirect_uri') redirect_uri?: string,
  ) {
    const params = new URLSearchParams({ type })
    if (redirect_uri) {
      params.set('redirect_uri', redirect_uri)
    }
    if (['google', 'microsoft', 'guest'].includes(type)) {
      const url = redirect_uri
        ? `${type}?${new URLSearchParams({ redirect_uri }).toString()}`
        : type
      return { url }
    }
    throw new BadRequestException(`Unknown login type "${type}"`)
  }

  @Get('google')
  @Redirect()
  @UseGuards(GoogleAuthGuard)
  async handleRedirect(
    @Req() req: RequestWithUserToken,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.cookie(AUTH_COOKIE_NAME, req.user.token, COOKIE_OPTIONS)
    return this.authService.handleRedirect(req)
  }

  @Get('microsoft')
  @Redirect()
  @UseGuards(MicrosoftAuthGuard)
  async microsoftHandleRedirect(
    @Req() req: RequestWithUserToken,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.cookie(AUTH_COOKIE_NAME, req.user.token, COOKIE_OPTIONS)
    return this.authService.handleRedirect(req)
  }

  @Get('guest')
  async guestLogin(
    @Query('redirect_uri') redirectUri: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.authService.guestLogin()
    res.cookie(AUTH_COOKIE_NAME, result.token, COOKIE_OPTIONS)
    if (redirectUri) {
      res.redirect(redirectUri)
    } else {
      res.json(result)
    }
  }

  @Post('root')
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
