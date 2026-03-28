import type { DecodedJWT, JWTPayload } from '@apollo-annotation/shared'
import {
  type CanActivate,
  type ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'
import { Reflector } from '@nestjs/core'

import { ActiveUsersService } from '../users/active-users.service.js'
import { UsersService } from '../users/users.service.js'

import { AUTH_COOKIE_NAME } from '../authentication/auth-cookie.js'

import type { RequestWithUser } from './request-with-user.js'
import { IS_PUBLIC_KEY } from './roles.guard.js'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private reflector: Reflector,
    @Inject(JwtService) private jwtService: JwtService,
    @Inject(UsersService) private usersService: UsersService,
    @Inject(ActiveUsersService) private activeUsers: ActiveUsersService,
  ) {}

  async canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    const request = context.switchToHttp().getRequest<RequestWithUser>()
    const token = this.extractToken(request)

    if (!token) {
      if (isPublic) {
        return true
      }
      throw new UnauthorizedException()
    }

    let payload: JWTPayload
    try {
      payload = this.jwtService.verify<JWTPayload>(token)
    } catch {
      if (isPublic) {
        return true
      }
      throw new UnauthorizedException()
    }

    const user = await this.usersService.findById(payload.id)
    if (!user) {
      if (isPublic) {
        return true
      }
      throw new UnauthorizedException('User no longer exists')
    }

    request.user = {
      ...payload,
      role: user.role,
      iat: 0,
      exp: 0,
    } satisfies DecodedJWT

    this.activeUsers.touch(payload.id)
    return true
  }

  private extractToken(req: RequestWithUser) {
    const authHeader = req.headers.authorization
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7)
    }
    const cookies = req.cookies as Record<string, string> | undefined
    if (cookies?.[AUTH_COOKIE_NAME]) {
      return cookies[AUTH_COOKIE_NAME]
    }
    return undefined
  }
}
