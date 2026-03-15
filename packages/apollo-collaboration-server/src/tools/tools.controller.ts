import type { DecodedJWT } from '@apollo-annotation/shared'
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Logger,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common'
import type { Request } from 'express'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { ToolsService } from './tools.service.js'

@Roles(Role.ReadOnly)
@Controller('tools')
export class ToolsController {
  constructor(
    @Inject(ToolsService) private readonly toolsService: ToolsService,
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
    body: { assembly: string; refSeqId: string; start: number; end: number },
    @Req() request: Request,
  ) {
    const { user } = request as unknown as { user: DecodedJWT }
    if (!user) {
      throw new Error('No user attached to request')
    }
    this.logger.log(
      `Tiberius run requested: ${body.assembly} ${body.refSeqId}:${body.start}-${body.end}`,
    )
    return this.toolsService.startTiberiusJob({ ...body, user })
  }

  @Get('tiberius/status/:jobId')
  getTiberiusStatus(@Param('jobId') jobId: string) {
    const status = this.toolsService.getJobStatus(jobId)
    if (!status) {
      throw new NotFoundException(`Job "${jobId}" not found`)
    }
    return status
  }
}
