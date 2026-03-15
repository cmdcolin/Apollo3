import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { Role, RoleInheritance } from './role/role.enum.js'

export const IS_PUBLIC_KEY = 'isPublic'
export const ROLES_KEY = 'roles'

export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
export const Roles = (role: Role) => SetMetadata(ROLES_KEY, role)

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

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

    const request = context.switchToHttp().getRequest()
    const user = request.user as { role?: string } | undefined
    if (!user?.role) {
      throw new UnauthorizedException()
    }

    const inherited = RoleInheritance[user.role as keyof typeof RoleInheritance]
    if (!inherited?.includes(requiredRole)) {
      throw new UnauthorizedException()
    }

    return true
  }
}
