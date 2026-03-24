import {
  Body,
  Controller,
  Get,
  Head,
  Inject,
  Logger,
  Param,
  Patch,
  Post,
} from '@nestjs/common'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { AssembliesService } from './assemblies.service.js'

interface AssemblyDocument {
  _id: string
  checks: string[]
}

@Roles(Role.ReadOnly)
@Controller('assemblies')
export class AssembliesController {
  constructor(
    @Inject(AssembliesService)
    private readonly assembliesService: AssembliesService,
  ) {}
  private readonly logger = new Logger(AssembliesController.name)

  @Head('checks')
  checksHead() {
    return ''
  }

  @Post('checks')
  @Roles(Role.Admin)
  updateChecks(@Body() updatedChecks: AssemblyDocument) {
    return this.assembliesService.updateChecks(
      updatedChecks._id,
      updatedChecks.checks,
    )
  }

  @Get()
  findAll() {
    return this.assembliesService.findAll()
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.assembliesService.findOne(id)
  }

  @Patch(':id/organism')
  @Roles(Role.Admin)
  updateOrganism(
    @Param('id') id: string,
    @Body() body: { organism: string | null },
  ) {
    return this.assembliesService.update(id, {
      organism: body.organism ?? undefined,
    })
  }
}
