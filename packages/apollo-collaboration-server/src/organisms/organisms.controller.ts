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
} from '@nestjs/common'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { CreateOrganismDto } from './dto/create-organism.dto.js'
import { UpdateOrganismDto } from './dto/update-organism.dto.js'
import { OrganismsService } from './organisms.service.js'

@Roles(Role.ReadOnly)
@Controller('organisms')
export class OrganismsController {
  constructor(@Inject(OrganismsService) private readonly organismsService: OrganismsService) {}
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
  findAll(
    @Query('offset') offsetStr?: string,
    @Query('limit') limitStr?: string,
  ) {
    const offset = offsetStr ? Number(offsetStr) : undefined
    const limit = limitStr ? Number(limitStr) : undefined
    return this.organismsService.findAll({ offset, limit })
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.organismsService.findOne(id)
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
