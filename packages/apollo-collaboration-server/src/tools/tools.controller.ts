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
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
  StreamableFile,
  HttpCode,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { ToolsService } from './tools.service.js'

const ALLOWED_FILES = new Set(['predictions.gtf'])

@Roles(Role.ReadOnly)
@Controller('tools')
export class ToolsController {
  constructor(
    @Inject(ToolsService) private readonly toolsService: ToolsService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<{
      FILE_UPLOAD_FOLDER: string
    }>,
  ) {}

  private readonly logger = new Logger(ToolsController.name)

  @Get('tiberius/available')
  getTiberiusAvailability() {
    return this.toolsService.getTiberiusAvailability()
  }

  @Post('tiberius/run')
  @Roles(Role.User)
  @HttpCode(202)
  async runTiberius(
    @Body()
    body: {
      assembly: string
      refSeqId: string
      refSeqName: string
      start: number
      end: number
      modelCfg?: string
      useSingularity?: boolean
    },
    @Req() request: Request,
  ) {
    const user = request.user as DecodedJWT
    this.logger.log(
      `Tiberius run requested: ${body.assembly} ${body.refSeqName}:${body.start}-${body.end}`,
    )
    const job = await this.toolsService.submitJob({
      assemblyId: body.assembly,
      refSeqId: body.refSeqId,
      refSeqName: body.refSeqName,
      start: body.start,
      end: body.end,
      modelCfg: body.modelCfg,
      useSingularity: body.useSingularity,
      createdBy: user?.id,
    })
    return { jobId: job._id }
  }

  @Get('tiberius/status/:jobId')
  async getTiberiusStatus(@Param('jobId') jobId: string) {
    const job = await this.toolsService.getJob(jobId)
    if (!job) {
      throw new NotFoundException(`Job "${jobId}" not found`)
    }
    return {
      jobId: job._id,
      status: job.status,
      error: job.error,
      trackConfigId: job.trackConfigId,
    }
  }

  @Get('tiberius/jobs')
  async getTiberiusJobs(@Req() request: Request) {
    const user = request.user as DecodedJWT
    if (!user?.id) {
      return []
    }
    return this.toolsService.getJobsByUser(user.id)
  }

  @Delete('tiberius/jobs/:jobId')
  @Roles(Role.User)
  async cancelTiberiusJob(@Param('jobId') jobId: string) {
    const cancelled = await this.toolsService.cancelJob(jobId)
    if (!cancelled) {
      throw new NotFoundException(
        `Job "${jobId}" not found or already completed`,
      )
    }
    return { success: true }
  }

  @Get('tiberius/files/:jobId/:filename')
  @Header('Content-Type', 'text/plain')
  serveTiberiusFile(
    @Param('jobId') jobId: string,
    @Param('filename') filename: string,
  ) {
    if (!ALLOWED_FILES.has(filename)) {
      throw new BadRequestException(`File "${filename}" is not allowed`)
    }

    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })!
    const filePath = join(fileUploadFolder, 'tiberius-jobs', jobId, filename)

    if (!existsSync(filePath)) {
      throw new NotFoundException(`File not found`)
    }

    return new StreamableFile(createReadStream(filePath))
  }
}
