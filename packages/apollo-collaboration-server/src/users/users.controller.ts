import type { DecodedJWT } from '@apollo-annotation/shared'
import { Controller, Get, Inject, Logger, Param, Req } from '@nestjs/common'
import type { Request } from 'express'

import { Role } from '../utils/role/role.enum.js'
import { Authenticated, Roles } from '../utils/roles.guard.js'

import { UsersService } from './users.service.js'

@Roles(Role.Admin)
@Controller('users')
export class UsersController {
  constructor(
    @Inject(UsersService) private readonly usersService: UsersService,
  ) {}
  private readonly logger = new Logger(UsersController.name)

  @Authenticated()
  @Get('me')
  getMe(@Req() req: Request) {
    const user = req.user as DecodedJWT
    return { username: user.username, email: user.email, role: user.role }
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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id)
  }
}
