import { createReadStream, existsSync } from 'node:fs'
import { join } from 'node:path'

import type { DecodedJWT } from '@apollo-annotation/shared'
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { AnalysisService } from './analysis.service.js'

const ALLOWED_FILES = new Set(['predictions.gtf'])

@Roles(Role.ReadOnly)
@Controller('analysis')
export class AnalysisController {
  constructor(
    @Inject(AnalysisService) private readonly service: AnalysisService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<{
      FILE_UPLOAD_FOLDER: string
    }>,
  ) {}

  @Get('tools')
  getTools() {
    return this.service.getTools()
  }

  // ── Databases ───────────────────────────────────────────────────────

  @Get('databases')
  getDatabases(@Query('assembly') assemblyId?: string) {
    return this.service.getDatabases(assemblyId)
  }

  @Get('databases/:id')
  async getDatabase(@Param('id') id: string) {
    const db = await this.service.getDatabase(id)
    if (!db) {
      throw new NotFoundException(`Analysis database "${id}" not found`)
    }
    return db
  }

  @Post('databases')
  @Roles(Role.Admin)
  createDatabase(
    @Body()
    body: {
      name: string
      tool: string
      params: Record<string, unknown>
      assemblyIds: string[]
    },
    @Req() request: Request,
  ) {
    const user = request.user as DecodedJWT | undefined
    return this.service.createDatabase({
      ...body,
      createdBy: user?.email,
    })
  }

  @Post('databases/build')
  @Roles(Role.Admin)
  @HttpCode(202)
  buildDatabase(
    @Body()
    body: {
      assemblyId: string
      tool: string
      name: string
      params: Record<string, unknown>
    },
    @Req() request: Request,
  ) {
    const user = request.user as DecodedJWT | undefined
    return this.service.buildDatabase({
      ...body,
      createdBy: user?.email,
    })
  }

  @Delete('databases/:id')
  @Roles(Role.Admin)
  async deleteDatabase(@Param('id') id: string) {
    const deleted = await this.service.deleteDatabase(id)
    if (!deleted) {
      throw new NotFoundException(`Analysis database "${id}" not found`)
    }
    return { deleted: true }
  }

  // ── Jobs ────────────────────────────────────────────────────────────

  @Post('jobs')
  @Roles(Role.User)
  @HttpCode(202)
  submitJob(
    @Body()
    body: {
      tool: string
      assemblyId?: string
      params: Record<string, unknown>
    },
    @Req() request: Request,
  ) {
    const user = request.user as DecodedJWT | undefined
    return this.service.submitJob({
      ...body,
      createdBy: user?.email,
    })
  }

  @Get('jobs')
  getMyJobs(@Req() request: Request) {
    const user = request.user as DecodedJWT | undefined
    if (user?.email) {
      return this.service.getJobsByUser(user.email)
    }
    return []
  }

  @Get('jobs/:id')
  async getJob(@Param('id') id: string) {
    const job = await this.service.getJob(id)
    if (!job) {
      throw new NotFoundException(`Analysis job "${id}" not found`)
    }
    return job
  }

  @Delete('jobs/:id')
  @HttpCode(200)
  async cancelJob(@Param('id') id: string) {
    const cancelled = await this.service.cancelJob(id)
    if (!cancelled) {
      throw new NotFoundException(
        `Analysis job "${id}" not found or already completed`,
      )
    }
    return { cancelled: true }
  }

  // ── Job files ──────────────────────────────────────────────────────

  @Get('jobs/:id/files/:filename')
  @Header('Content-Type', 'text/plain')
  serveJobFile(
    @Param('id') jobId: string,
    @Param('filename') filename: string,
  ) {
    if (!ALLOWED_FILES.has(filename)) {
      throw new BadRequestException(`File "${filename}" is not allowed`)
    }

    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })!
    const filePath = join(fileUploadFolder, 'analysis-jobs', jobId, filename)

    if (!existsSync(filePath)) {
      throw new NotFoundException('File not found')
    }

    return new StreamableFile(createReadStream(filePath))
  }
}
