import type { DecodedJWT } from '@apollo-annotation/shared'
import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'

import { Role } from '../utils/role/role.enum.js'
import { Authenticated, Roles } from '../utils/roles.guard.js'

import { UserLocationDto } from './dto/create-user.dto.js'
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

  @Roles(Role.ReadOnly)
  @Get('locations')
  usersLocations(@Req() req: Request) {
    const user = req.user as DecodedJWT
    this.logger.debug('Requesting other users locations')
    return this.usersService.requestUsersLocations(user)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findById(id)
  }

  // NOTE: All GET endpoints must be before POST endpoints

  @Roles(Role.ReadOnly)
  @Post('userLocation')
  userLoc(@Body() userLocDto: UserLocationDto[], @Req() req: Request) {
    const keys = Object.keys(userLocDto)
    const userLocationArray: UserLocationDto[] = JSON.parse(
      `[${keys.toString()}]`,
    )
    this.logger.debug(
      `One user's location info: ${JSON.stringify(userLocationArray)}`,
    )
    const user = req.user as DecodedJWT
    return this.usersService.broadcastLocation(userLocationArray, user)
  }
}
