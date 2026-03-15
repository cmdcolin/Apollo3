import {
  Body,
  Controller,
  Get,
  Head,
  Logger,
  Param,
  Patch,
  Post,
} from '@nestjs/common'

import { Role } from '../utils/role/role.enum.js'
import { Validations } from '../utils/validation/validatation.decorator.js'

import { AssembliesService } from './assemblies.service.js'

interface AssemblyDocument {
  _id: string
  checks: string[]
}

@Validations(Role.ReadOnly)
@Controller('assemblies')
export class AssembliesController {
  constructor(private readonly assembliesService: AssembliesService) {}
  private readonly logger = new Logger(AssembliesController.name)

  @Head('checks')
  checksHead() {
    return ''
  }

  @Post('checks')
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
  @Validations(Role.Admin)
  updateOrganism(
    @Param('id') id: string,
    @Body() body: { organism: string | null },
  ) {
    return this.assembliesService.update(id, {
      organism: body.organism ?? undefined,
    })
  }
}
