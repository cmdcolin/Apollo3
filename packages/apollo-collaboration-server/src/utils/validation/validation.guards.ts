import { validationRegistry } from '@apollo-annotation/shared'
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  Logger,
  UnprocessableEntityException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { IS_PUBLIC_KEY } from '../jwt-auth.guard.js'

@Injectable()
export class ValidationGuard implements CanActivate {
  private readonly logger = new Logger(ValidationGuard.name)

  constructor(private reflector: Reflector) {}

  /**
   * Check if user has such role that user is allowed to execute endpoint
   * @param context -
   * @returns TRUE: user is allowed to execute endpoint
   *          FALSE: user is not allowed to execute endpoint
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }
    try {
      const validationResult = await validationRegistry.backendPreValidate({
        context,
        reflector: this.reflector,
      })
      if (!validationResult.ok) {
        throw new UnprocessableEntityException(
          `Error in backend authorization pre-validation: ${validationResult.resultsMessages}`,
        )
      }
      return true
    } catch (error) {
      this.logger.error(error)
      return false
    }
  }
}
