import { Controller, Get, Inject, Logger, Param, Req } from '@nestjs/common'

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
  getMe(@Req() req: RequestWithUser) {
    return {
      username: req.user?.username,
      email: req.user?.email,
      role: req.user?.role,
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id)
  }
}
