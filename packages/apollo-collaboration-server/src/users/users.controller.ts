import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Req,
} from '@nestjs/common'

import type { RequestWithUser } from '../utils/request-with-user.js'
import { Role } from '../utils/role/role.enum.js'
import { Authenticated, Roles } from '../utils/roles.guard.js'

import { ActiveUsersService } from './active-users.service.js'
import { UsersService } from './users.service.js'

@Roles(Role.Admin)
@Controller('users')
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
    @Inject(ActiveUsersService)
    private readonly activeUsersService: ActiveUsersService,
  ) {}
  private readonly logger = new Logger(UsersController.name)

  @Authenticated()
  @Get('me')
  async getMe(@Req() req: RequestWithUser) {
    const user = req.user?.id
      ? await this.usersService.findById(req.user.id)
      : undefined
    const dbRole = user?.role ?? req.user?.role
    return {
      username: req.user?.username,
      email: req.user?.email,
      role: dbRole,
      pendingApproval: user?.pendingApproval ?? false,
      needsRelogin: dbRole !== req.user?.role,
    }
  }

  @Get()
  findAll() {
    return this.usersService.findAll()
  }

  @Authenticated()
  @Get('admin')
  findAdmin() {
    return this.usersService.findByRole(Role.Admin)
  }

  @Authenticated()
  @Get('stats')
  async getStats() {
    return {
      active: this.activeUsersService.getActiveCount(),
      total: await this.usersService.getCount(),
    }
  }

  @Roles(Role.Admin)
  @Get('pending-count')
  async getPendingCount() {
    return { count: await this.usersService.getPendingCount() }
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  @Patch(':id')
  async updateRole(@Param('id') id: string, @Body() body: { role: Role }) {
    const user = await this.usersService.updateRole(id, body.role)
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`)
    }
    return user
  }

  @Delete(':id')
  async deleteUser(@Param('id') id: string) {
    const user = await this.usersService.findById(id)
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`)
    }
    await this.usersService.remove(id)
    return { message: `User "${id}" deleted successfully` }
  }
}
