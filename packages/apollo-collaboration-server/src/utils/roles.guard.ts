import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import type { Request } from 'express'

import { Role, RoleInheritance } from './role/role.enum.js'

export const IS_PUBLIC_KEY = 'isPublic'
export const ROLES_KEY = 'roles'

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
export const Roles = (role: Role) => SetMetadata(ROLES_KEY, role)
export const Authenticated = () => SetMetadata(ROLES_KEY, Role.None)

@Injectable()
export class RolesGuard implements CanActivate {
  private readonly logger = new Logger(RolesGuard.name)

  constructor(@Inject(Reflector) private reflector: Reflector) {}

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])
    if (isPublic) {
      return true
    }

    const requiredRole =
      this.reflector.getAllAndOverride<Role>(ROLES_KEY, [
        context.getHandler(),
        context.getClass(),
      ]) ?? Role.Admin

    const request = context.switchToHttp().getRequest<Request>()
    const user = request.user as { role?: string } | undefined
    if (!user?.role) {
      this.logger.debug(
        `401 Unauthorized: ${request.method} ${request.url} — no user/role in request`,
      )
      throw new UnauthorizedException()
    }

    const inherited = RoleInheritance[user.role as keyof typeof RoleInheritance]
    if (!inherited?.includes(requiredRole)) {
      this.logger.debug(
        `403 Forbidden: ${request.method} ${request.url} — user.role=${user.role}, requiredRole=${requiredRole}`,
      )
      throw new ForbiddenException()
    }

    return true
  }
}
