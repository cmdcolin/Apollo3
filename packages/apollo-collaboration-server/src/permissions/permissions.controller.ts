import { randomBytes } from 'node:crypto'

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
} from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'
import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { PermissionService } from './permission.service.js'

interface SetPermissionBody {
  userId: string
  role: 'admin' | 'user' | 'readOnly'
}

@Roles(Role.Admin)
@Controller('assemblies')
export class PermissionsController {
  constructor(
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  @Get(':id/permissions')
  async listPermissions(@Param('id') assemblyId: string) {
    const assembly = await this.db.assembly.findById(assemblyId)
    if (!assembly) {
      throw new NotFoundException(`Assembly ${assemblyId} not found`)
    }
    return this.db.assemblyPermission.findByAssembly(assemblyId)
  }

  @Put(':id/permissions')
  async setPermission(
    @Param('id') assemblyId: string,
    @Body() body: SetPermissionBody,
  ) {
    const assembly = await this.db.assembly.findById(assemblyId)
    if (!assembly) {
      throw new NotFoundException(`Assembly ${assemblyId} not found`)
    }
    const user = await this.db.user.findById(body.userId)
    if (!user) {
      throw new NotFoundException(`User ${body.userId} not found`)
    }
    const existing = await this.db.assemblyPermission.findByUserAndAssembly(
      body.userId,
      assemblyId,
    )
    if (existing) {
      await this.db.assemblyPermission.deleteById(existing._id)
    }
    return this.db.assemblyPermission.create({
      _id: randomBytes(12).toString('hex'),
      user: body.userId,
      assembly: assemblyId,
      role: body.role,
    })
  }

  @Delete(':id/permissions/:userId')
  async removePermission(
    @Param('id') assemblyId: string,
    @Param('userId') userId: string,
  ) {
    const deleted = await this.db.assemblyPermission.deleteByUserAndAssembly(
      userId,
      assemblyId,
    )
    if (!deleted) {
      throw new NotFoundException('Permission not found')
    }
    return { success: true }
  }
}
