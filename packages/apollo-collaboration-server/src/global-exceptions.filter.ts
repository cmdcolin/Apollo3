import {
  type ArgumentsHost,
  Catch,
  HttpException,
  Logger,
} from '@nestjs/common'
import { BaseExceptionFilter } from '@nestjs/core'
import type { Request, Response } from 'express'

@Catch()
export class GlobalExceptionsFilter extends BaseExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionsFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    this.logger.error(exception)

    if (host.getType() === 'http') {
      const ctx = host.switchToHttp()
      const request = ctx.getRequest<Request>()
      const preferred = request.accepts(['json', 'html'])

      if (preferred === 'html') {
        const response = ctx.getResponse<Response>()
        const status =
          exception instanceof HttpException ? exception.getStatus() : 500
        const message =
          exception instanceof HttpException
            ? exception.message
            : 'Internal Server Error'
        const params = new URLSearchParams({
          status: String(status),
          message,
        })
        response.redirect(`/error/?${params.toString()}`)
        return
      }
    }

    super.catch(exception, host)
  }
}
