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
  Post,
} from '@nestjs/common'

import { Role } from '../authentication/role.enum.js'
import { Roles } from '../authentication/roles.guard.js'

import { AssembliesService } from './assemblies.service.js'
import type { CreateAssemblyDto } from './dto/create-assembly.dto.js'
import type { UpdateAssemblyDto } from './dto/update-assembly.dto.js'

@Roles(Role.ReadOnly)
@Controller('assemblies')
export class AssembliesController {
  constructor(
    @Inject(AssembliesService)
    private readonly assembliesService: AssembliesService,
  ) {}
  private readonly logger = new Logger(AssembliesController.name)

  @Post()
  @Roles(Role.Admin)
  createAssembly(@Body() body: CreateAssemblyDto) {
    return this.assembliesService.create(body)
  }

  @Get()
  findAll() {
    return this.assembliesService.findAll()
  }

  @Get('by-name/:name')
  findOneByName(@Param('name') name: string) {
    return this.assembliesService.findOneByName(name)
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assembliesService.findOne(id)
  }

  @Patch(':id')
  @Roles(Role.Admin)
  async updateAssembly(
    @Param('id') id: string,
    @Body() body: UpdateAssemblyDto,
  ) {
    if (body.checks) {
      await this.assembliesService.updateChecks(id, body.checks)
    }
    return this.assembliesService.update(id, {
      displayName: body.displayName,
      description: body.description,
      aliases: body.aliases,
      organism: body.organism ?? undefined,
      visibility: body.visibility,
      sequenceSource: body.sequenceSource,
    })
  }

  @Delete(':id')
  @Roles(Role.Admin)
  async deleteAssembly(@Param('id') id: string) {
    const deleted = await this.assembliesService.remove(id)
    if (!deleted) {
      throw new NotFoundException(`Assembly with id "${id}" not found`)
    }
    this.logger.debug(`Assembly "${id}" deleted.`)
    return { message: `Assembly "${id}" deleted successfully` }
  }
}
