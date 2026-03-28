import fs from 'node:fs'

import type { DecodedJWT } from '@apollo-annotation/shared'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { PassportStrategy } from '@nestjs/passport'
import type { Request } from 'express'
import { ExtractJwt, Strategy } from 'passport-jwt'

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
  const cookieKeys = cookies ? Object.keys(cookies) : []
  console.warn(
    `[jwt-debug] ${req.method} ${req.url} — NO token found (cookies: [${cookieKeys.join(', ')}], origin: ${req.headers.origin ?? 'none'})`,
  )
  return null
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  private readonly logger = new Logger(JwtStrategy.name)
  constructor(
    @Inject(ConfigService) configService: ConfigService<JWTSecretConfig, true>,
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

  validate(payload: DecodedJWT): DecodedJWT {
    return payload
  }
}
