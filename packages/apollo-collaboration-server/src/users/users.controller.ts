import { randomBytes } from 'node:crypto'

import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Patch,
  Post,
  Req,
} from '@nestjs/common'

import type { RequestWithUser } from '../authentication/request-with-user.js'
import { Role } from '../authentication/role.enum.js'
import { Authenticated, Public, Roles } from '../authentication/roles.guard.js'

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

  @Public()
  @Get('me')
  async getMe(@Req() req: RequestWithUser) {
    if (!req.user) {
      return null
    }
    const user = req.user.id
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

  @Post()
  async createUser(
    @Body() body: { email: string; username: string; role?: Role },
  ) {
    const existing = await this.usersService.findByEmail(body.email)
    if (existing) {
      throw new BadRequestException('A user with that email already exists')
    }
    const inviteToken = randomBytes(32).toString('hex')
    const user = await this.usersService.addNew({
      email: body.email,
      username: body.username,
      role: body.role ?? Role.User,
      pendingApproval: false,
    })
    await this.usersService.setInviteToken(user._id, inviteToken)
    const { passwordHash: _, inviteToken: _t, ...safeUser } = user
    return { ...safeUser, inviteToken }
  }

  @Post(':id/reinvite')
  async reinvite(@Param('id') id: string) {
    const user = await this.usersService.findById(id)
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`)
    }
    const inviteToken = randomBytes(32).toString('hex')
    await this.usersService.setInviteToken(id, inviteToken)
    return { inviteToken }
  }

  @Patch(':id/password')
  async resetPassword(
    @Param('id') id: string,
    @Body() body: { password: string },
  ) {
    const { hash } = await import('bcryptjs')
    const user = await this.usersService.findById(id)
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`)
    }
    const passwordHash = await hash(body.password, 10)
    await this.usersService.setPassword(id, passwordHash)
    return { message: 'Password updated' }
  }

  @Get()
  async findAll() {
    const users = await this.usersService.findAll()
    return users.map(({ passwordHash: _, inviteToken: _t, ...rest }) => rest)
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
  async findOne(@Param('id') id: string) {
    const user = await this.usersService.findById(id)
    if (!user) {
      throw new NotFoundException(`User with id "${id}" not found`)
    }
    const { passwordHash: _, inviteToken: _t, ...rest } = user
    return rest
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
