import { Injectable, type ExecutionContext } from '@nestjs/common'
import { ThrottlerGuard } from '@nestjs/throttler'

import type { RequestWithUser } from './request-with-user.js'

@Injectable()
export class AuthAwareThrottlerGuard extends ThrottlerGuard {
  protected async shouldSkip(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<RequestWithUser>()
    return req.user !== undefined
  }
}
