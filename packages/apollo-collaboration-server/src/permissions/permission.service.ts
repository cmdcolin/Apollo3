import { ForbiddenException, Inject, Injectable } from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'
import { Role, RoleInheritance } from '../utils/role/role.enum.js'

@Injectable()
export class PermissionService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private async isGlobalAdmin(userId: string | undefined) {
    if (!userId) {
      return false
    }
    const user = await this.db.user.findById(userId)
    return user?.role === 'admin'
  }

  async getAssemblyRole(
    userId: string | undefined,
    assemblyId: string,
  ): Promise<Role | undefined> {
    if (await this.isGlobalAdmin(userId)) {
      return Role.Admin
    }

    const assembly = await this.db.assembly.findById(assemblyId)
    if (!assembly) {
      return undefined
    }

    if (userId) {
      const permission = await this.db.assemblyPermission.findByUserAndAssembly(
        userId,
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

  async getAccessibleAssemblyIds(userId: string | undefined) {
    if (await this.isGlobalAdmin(userId)) {
      return this.db.assembly.findAllIds()
    }

    const publicAssemblies = await this.db.assembly.findPublic()
    const publicIds = publicAssemblies.map((a) => a._id)

    if (!userId) {
      return publicIds
    }

    const permissions = await this.db.assemblyPermission.findByUser(userId)
    const permittedIds = permissions.map((p) => p.assembly)

    const idSet = new Set([...publicIds, ...permittedIds])
    return [...idSet]
  }

  // Check access for specific assembly IDs without fetching all accessible IDs.
  async filterAccessibleIds(userId: string | undefined, assemblyIds: string[]) {
    if (await this.isGlobalAdmin(userId)) {
      return assemblyIds
    }
    const accessible: string[] = []
    for (const id of assemblyIds) {
      const role = await this.getAssemblyRole(userId, id)
      if (role) {
        accessible.push(id)
      }
    }
    return accessible
  }

  async assertAssemblyAccess(
    userId: string | undefined,
    assemblyId: string,
    minRole: Role,
  ) {
    const role = await this.getAssemblyRole(userId, assemblyId)
    if (!role) {
      throw new ForbiddenException(`No access to assembly ${assemblyId}`)
    }
    const inherited = RoleInheritance[role]
    if (!inherited?.includes(minRole)) {
      throw new ForbiddenException(
        `Insufficient permissions on assembly ${assemblyId}`,
      )
    }
  }
}
