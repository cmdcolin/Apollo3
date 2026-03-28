import fs from 'node:fs'

import type { DecodedJWT } from '@apollo-annotation/shared'
import { Inject, Injectable, Logger, UnauthorizedException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import type { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'

import { UsersService } from '../../users/users.service.js'

export const AUTH_COOKIE_NAME = 'apollo-token'

interface JWTSecretConfig {
  JWT_SECRET?: string
  JWT_SECRET_FILE?: string
}

function extractFromCookieOrHeader(req: Request) {
  const fromHeader = ExtractJwt.fromAuthHeaderAsBearerToken()(req)
  if (fromHeader) {
    return fromHeader
  }
  const cookies = req.cookies as Record<string, string> | undefined
  if (cookies?.[AUTH_COOKIE_NAME]) {
    return cookies[AUTH_COOKIE_NAME]
  }
  return null
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name)
  constructor(
    @Inject(ConfigService) configService: ConfigService<JWTSecretConfig, true>,
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {
    let jwtSecret = configService.get('JWT_SECRET', { infer: true })
    if (!jwtSecret) {
      // We can use non-null assertion since joi already checks this for us
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      const uriFile = configService.get('JWT_SECRET_FILE', { infer: true })!
      jwtSecret = fs.readFileSync(uriFile, 'utf8').trim()
    }
    super({
      jwtFromRequest: extractFromCookieOrHeader,
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    })
  }

  async validate(payload: DecodedJWT): Promise<DecodedJWT> {
    const user = await this.usersService.findById(payload.id)
    if (!user) {
      throw new UnauthorizedException('User no longer exists')
    }
    return { ...payload, role: user.role }
  }
}
