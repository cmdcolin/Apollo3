import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'

import type { RequestWithUser } from '../authentication/request-with-user.js'
import { Role } from '../authentication/role.enum.js'
import { Public, Roles } from '../authentication/roles.guard.js'

import type { CreateOrganismDto } from './dto/create-organism.dto.js'
import type { UpdateOrganismDto } from './dto/update-organism.dto.js'
import { OrganismsService } from './organisms.service.js'

@Roles(Role.ReadOnly)
@Controller('organisms')
export class OrganismsController {
  constructor(
    @Inject(OrganismsService)
    private readonly organismsService: OrganismsService,
  ) {}
  private readonly logger = new Logger(OrganismsController.name)

  @Get('count')
  async getCount() {
    const count = await this.organismsService.count()
    return { count }
  }

  @Post()
  @Roles(Role.Admin)
  create(@Body() dto: CreateOrganismDto) {
    return this.organismsService.create(dto)
  }

  @Get()
  @Public()
  findAll(
    @Req() req: RequestWithUser,
    @Query('offset') offsetStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const offset = offsetStr ? Number(offsetStr) : undefined
    const limit = limitStr ? Number(limitStr) : undefined
    return this.organismsService.findForUser(req.user, { offset, limit })
  }

  @Get(':id')
  @Public()
  findOne(@Param('id') id: string, @Req() req: RequestWithUser) {
    return this.organismsService.findOneForUser(id, req.user)
  }

  @Patch(':id')
  @Roles(Role.Admin)
  update(@Param('id') id: string, @Body() dto: UpdateOrganismDto) {
    return this.organismsService.update(id, dto)
  }

  @Delete(':id')
  @Roles(Role.Admin)
  remove(@Param('id') id: string) {
    return this.organismsService.remove(id)
  }
}
