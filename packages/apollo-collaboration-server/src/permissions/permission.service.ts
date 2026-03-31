import { ForbiddenException, Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'
import { Role, RoleInheritance } from '../authentication/role.enum.js'

export interface UserInfo {
  id?: string
  role?: string
}

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name)

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private async getAssemblyRole(
    user: UserInfo | undefined,
    assemblyId: string,
  ): Promise<Role | undefined> {
    this.logger.debug(
      `getAssemblyRole: userId=${user?.id ?? 'none'}, userRole=${user?.role ?? 'none'}, assemblyId=${assemblyId}`,
    )
    if (user?.role === Role.Admin) {
      return Role.Admin
    }

    const assembly = await this.db.assembly.findById(assemblyId)
    if (!assembly) {
      return undefined
    }

    if (user?.id) {
      const permission = await this.db.assemblyPermission.findByUserAndAssembly(
        user.id,
        assemblyId,
      )
      if (permission) {
        return permission.role as Role
      }
    }

    if (assembly.visibility === 'public') {
      return Role.ReadOnly
    }
    return undefined
  }

  async getAccessibleAssemblyIds(user: UserInfo | undefined) {
    if (user?.role === Role.Admin) {
      return this.db.assembly.findAllIds()
    }

    const publicAssemblies = await this.db.assembly.findPublic()
    const publicIds = publicAssemblies.map((a) => a._id)

    if (!user?.id) {
      return publicIds
    }

    const permissions = await this.db.assemblyPermission.findByUser(user.id)
    const permittedIds = permissions.map((p) => p.assembly)

    const idSet = new Set([...publicIds, ...permittedIds])
    return [...idSet]
  }

  async filterAccessibleIds(user: UserInfo | undefined, assemblyIds: string[]) {
    if (user?.role === Role.Admin) {
      return assemblyIds
    }
    const accessible: string[] = []
    for (const id of assemblyIds) {
      const role = await this.getAssemblyRole(user, id)
      if (role) {
        accessible.push(id)
      }
    }
    return accessible
  }

  async checkIfUserHasPermissionForAssemblies(
    user: UserInfo | undefined,
    assemblyIds: string[],
    minRole: Role,
  ) {
    for (const assemblyId of assemblyIds) {
      await this.checkIfUserHasPermissionForAssembly(user, assemblyId, minRole)
    }
  }

  async checkIfUserHasPermissionForAssembly(
    user: UserInfo | undefined,
    assemblyId: string,
    minRole: Role,
  ) {
    const role = await this.getAssemblyRole(user, assemblyId)
    if (!role) {
      this.logger.debug(
        `403 checkIfUserHasPermissionForAssembly: userId=${user?.id}, assemblyId=${assemblyId}, minRole=${minRole} — no role found (assembly not public and no permission entry)`,
      )
      throw new ForbiddenException(`No access to assembly ${assemblyId}`)
    }
    const inherited = RoleInheritance[role]
    if (!inherited.includes(minRole)) {
      this.logger.debug(
        `403 checkIfUserHasPermissionForAssembly: userId=${user?.id}, assemblyId=${assemblyId}, minRole=${minRole}, userAssemblyRole=${role} — insufficient permissions`,
      )
      throw new ForbiddenException(
        `Insufficient permissions on assembly ${assemblyId}`,
      )
    }
  }
}
