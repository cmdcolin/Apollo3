import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { tap } from 'rxjs'

import { AUTH_COOKIE_NAME, COOKIE_OPTIONS } from './auth-cookie.js'

@Injectable()
export class SlidingWindowInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler) {
    return next.handle().pipe(
      tap(() => {
        const req = context.switchToHttp().getRequest<Request>()
        const cookies = req.cookies as Record<string, string> | undefined
        const token = cookies?.[AUTH_COOKIE_NAME]
        if (token) {
          const res = context.switchToHttp().getResponse<Response>()
          if (!res.headersSent) {
            res.cookie(AUTH_COOKIE_NAME, token, COOKIE_OPTIONS)
          }
        }
      }),
    )
  }
}
