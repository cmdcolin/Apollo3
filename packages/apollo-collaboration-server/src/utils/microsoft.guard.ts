import { type ExecutionContext, Injectable } from '@nestjs/common'
import { AuthGuard, type IAuthModuleOptions } from '@nestjs/passport'
import type { Request } from 'express'

@Injectable()
export class MicrosoftAuthGuard extends AuthGuard('microsoft') {
  getAuthenticateOptions(
    context: ExecutionContext,
  ): IAuthModuleOptions | undefined {
    const req = context.switchToHttp().getRequest<Request>()
    const redirectUri = req.query.redirect_uri
    if (typeof redirectUri === 'string') {
      return { state: { redirect_uri: redirectUri } }
    }
    return
  }
}
