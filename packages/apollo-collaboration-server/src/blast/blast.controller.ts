import type { DecodedJWT } from '@apollo-annotation/shared'
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
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

  // ── BLAST database configs ───────────────────────────────────────────

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

  // ── BLAST jobs ───────────────────────────────────────────────────────

  @Post('jobs')
  @Roles(Role.User)
  @HttpCode(202)
  submitJob(
    @Body() body: { program: string; database: string; query: string },
    @Req() request: Request,
  ) {
    const user = request.user as DecodedJWT | undefined
    return this.blastService.submitJob({
      ...body,
      createdBy: user?.email,
    })
  }

  @Get('jobs')
  getMyJobs(@Req() request: Request) {
    const user = request.user as DecodedJWT | undefined
    if (user?.email) {
      return this.blastService.getJobsByUser(user.email)
    }
    return []
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const job = await this.blastService.getJob(id)
    if (!job) {
      throw new NotFoundException(`BLAST job "${id}" not found`)
    }
    return job
  }

  @Delete('jobs/:id')
  @HttpCode(200)
  async cancelJob(@Param('id') id: string) {
    const cancelled = await this.blastService.cancelJob(id)
    if (!cancelled) {
      throw new NotFoundException(
        `BLAST job "${id}" not found or already completed`,
      )
    }
    return { cancelled: true }
  }
}
