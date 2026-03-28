import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { Response } from 'express'
import { tap } from 'rxjs'

import type { RequestWithUser } from './request-with-user.js'
import { AUTH_COOKIE_NAME } from './auth-cookie.js'

import { COOKIE_OPTIONS } from './auth-cookie.js'

@Injectable()
export class SlidingWindowInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      tap(() => {
        const req = context.switchToHttp().getRequest<RequestWithUser>()
        const cookies = req.cookies as Record<string, string> | undefined
        const token = cookies?.[AUTH_COOKIE_NAME]
        if (token) {
          const res = context.switchToHttp().getResponse<Response>()
          res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS)
        }
      }),
    )
  }
}
