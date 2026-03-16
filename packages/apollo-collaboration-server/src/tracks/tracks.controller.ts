import { randomBytes } from 'node:crypto'

import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'

import type { RequestWithUser } from '../jbrowse/jbrowse.controller.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { PermissionService } from '../permissions/permission.service.js'
import { Role } from '../utils/role/role.enum.js'
import { Authenticated } from '../utils/roles.guard.js'

interface CreateTrackBody {
  trackId: string
  assemblyIds: string[]
  config: Record<string, unknown>
}

interface UpdateTrackBody {
  config?: Record<string, unknown>
  assemblyIds?: string[]
}

@Authenticated()
@Controller('tracks')
export class TracksController {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
  ) {}

  private async assertAccessToAssemblies(
    userId: string | undefined,
    assemblyIds: string[],
    minRole: Role,
  ) {
    for (const assemblyId of assemblyIds) {
      await this.permissionService.assertAssemblyAccess(
        userId,
        assemblyId,
        minRole,
      )
    }
  }

  @Post()
  async create(@Req() request: RequestWithUser, @Body() body: CreateTrackBody) {
    const userId = request.user?.id
    await this.assertAccessToAssemblies(userId, body.assemblyIds, Role.User)
    return this.db.trackConfig.create({
      _id: randomBytes(12).toString('hex'),
      trackId: body.trackId,
      assemblyIds: body.assemblyIds,
      config: body.config,
      createdBy: userId,
    })
  }

  @Get()
  async list(
    @Req() request: RequestWithUser,
    @Query('assembly') assemblyId?: string,
  ) {
    const userId = request.user?.id
    if (assemblyId) {
      await this.permissionService.assertAssemblyAccess(
        userId,
        assemblyId,
        Role.ReadOnly,
      )
      return this.db.trackConfig.findByAssemblyId(assemblyId)
    }
    const accessibleIds =
      await this.permissionService.getAccessibleAssemblyIds(userId)
    return this.db.trackConfig.findByAssemblyIds(accessibleIds)
  }

  @Patch(':id')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() body: UpdateTrackBody,
  ) {
    const userId = request.user?.id
    const existing = await this.db.trackConfig.findById(id)
    if (!existing) {
      throw new NotFoundException(`Track ${id} not found`)
    }
    await this.assertAccessToAssemblies(userId, existing.assemblyIds, Role.User)
    if (body.assemblyIds) {
      await this.assertAccessToAssemblies(userId, body.assemblyIds, Role.User)
    }
    return this.db.trackConfig.updateById(id, body)
  }

  @Delete(':id')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const userId = request.user?.id
    const existing = await this.db.trackConfig.findById(id)
    if (!existing) {
      throw new NotFoundException(`Track ${id} not found`)
    }
    await this.assertAccessToAssemblies(userId, existing.assemblyIds, Role.User)
    await this.db.trackConfig.deleteById(id)
    return { success: true }
  }
}
