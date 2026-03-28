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

import { DatabaseService } from '../mikro-orm/database.service.js'
import { PermissionService } from '../permissions/permission.service.js'
import type { RequestWithUser } from '../utils/request-with-user.js'
import { Role } from '../utils/role/role.enum.js'
import { Authenticated, Public } from '../utils/roles.guard.js'

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

  @Post()
  async create(@Req() request: RequestWithUser, @Body() body: CreateTrackBody) {
    await this.permissionService.checkIfUserHasPermissionForAssemblies(
      request.user,
      body.assemblyIds,
      Role.User,
    )
    return this.db.trackConfig.create({
      _id: randomBytes(12).toString('hex'),
      trackId: body.trackId,
      assemblyIds: body.assemblyIds,
      config: body.config,
      createdBy: request.user?.id,
    })
  }

  @Public()
  @Get()
  async list(
    @Req() request: RequestWithUser,
    @Query('assembly') assemblyId?: string,
  ) {
    if (assemblyId) {
      await this.permissionService.checkIfUserHasPermissionForAssembly(
        request.user,
        assemblyId,
        Role.ReadOnly,
      )
      return this.db.trackConfig.findByAssemblyId(assemblyId)
    }
    const accessibleIds = await this.permissionService.getAccessibleAssemblyIds(
      request.user,
    )
    return this.db.trackConfig.findByAssemblyIds(accessibleIds)
  }

  @Patch(':id')
  async update(
    @Req() request: RequestWithUser,
    @Param('id') id: string,
    @Body() body: UpdateTrackBody,
  ) {
    const existing = await this.db.trackConfig.findById(id)
    if (!existing) {
      throw new NotFoundException(`Track ${id} not found`)
    }
    await this.permissionService.checkIfUserHasPermissionForAssemblies(
      request.user,
      existing.assemblyIds,
      Role.User,
    )
    if (body.assemblyIds) {
      await this.permissionService.checkIfUserHasPermissionForAssemblies(
        request.user,
        body.assemblyIds,
        Role.User,
      )
    }
    return this.db.trackConfig.updateById(id, body)
  }

  @Delete(':id')
  async remove(@Req() request: RequestWithUser, @Param('id') id: string) {
    const existing = await this.db.trackConfig.findById(id)
    if (!existing) {
      throw new NotFoundException(`Track ${id} not found`)
    }
    await this.permissionService.checkIfUserHasPermissionForAssemblies(
      request.user,
      existing.assemblyIds,
      Role.User,
    )
    await this.db.trackConfig.deleteById(id)
    return { success: true }
  }
}
