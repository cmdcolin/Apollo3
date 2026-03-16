import type { DecodedJWT } from '@apollo-annotation/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { BlastService } from './blast.service.js'

@Roles(Role.ReadOnly)
@Controller('blast')
export class BlastController {
  constructor(
    @Inject(BlastService) private readonly blastService: BlastService,
  ) {}

  @Get('databases')
  getDatabases(@Query('assembly') assemblyId?: string) {
    return this.blastService.getBlastDbs(assemblyId)
  }

  @Post('databases')
  @Roles(Role.Admin)
  createDatabase(
    @Body()
    body: {
      name: string
      program: string
      database: string
      assemblyIds: string[]
    },
    @Req() request: Request,
  ) {
    const user = request.user as DecodedJWT | undefined
    return this.blastService.createBlastDb({
      ...body,
      createdBy: user?.email,
    })
  }

  @Delete('databases/:id')
  @Roles(Role.Admin)
  async deleteDatabase(@Param('id') id: string) {
    const deleted = await this.blastService.deleteBlastDb(id)
    if (!deleted) {
      throw new NotFoundException(`BLAST database config "${id}" not found`)
    }
    return { deleted: true }
  }

  @Post('search')
  submitSearch(
    @Body() body: { program: string; database: string; query: string },
  ) {
    return this.blastService.submitBlastSearch(body)
  }

  @Get('status/:rid')
  checkStatus(@Param('rid') rid: string) {
    return this.blastService.checkBlastStatus(rid)
  }

  @Get('results/:rid')
  getResults(@Param('rid') rid: string) {
    return this.blastService.getBlastResults(rid)
  }
}
