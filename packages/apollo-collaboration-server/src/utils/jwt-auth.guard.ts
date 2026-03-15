/* eslint-disable @typescript-eslint/no-unsafe-return */
import type { JWTPayload } from '@apollo-annotation/shared'
import {
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AuthGuard } from '@nestjs/passport'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super()
  }

  handleRequest(
    err: Error | undefined,
    user: JWTPayload | undefined,
    info: unknown,
    context: ExecutionContext,
    status?: unknown,
  ) {
    if (err) {
      throw err
    }
    if (!user) {
      const isPublic = this.reflector.getAllAndOverride<boolean>(
        IS_PUBLIC_KEY,
        [context.getHandler(), context.getClass()],
      )
      if (isPublic) {
        return { role: 'none' }
      }
      throw new UnauthorizedException()
    }
    return super.handleRequest(err, user, info, context, status)
  }
}
