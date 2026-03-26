import type { Change } from '@apollo-annotation/common'
import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common'

import { ParseChangePipe } from '../utils/parse-change.pipe.js'
import type { RequestWithUser } from '../utils/request-with-user.js'
import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { ChangesService } from './changes.service.js'
import type { FindChangeDto } from './dto/find-change.dto.js'

@Roles(Role.ReadOnly)
@Controller('changes')
export class ChangesController {
  constructor(
    @Inject(ChangesService) private readonly changesService: ChangesService,
  ) {}
  private readonly logger = new Logger(ChangesController.name)

  @Post()
  @Roles(Role.User)
  async create(
    @Body(ParseChangePipe) change: Change,
    @Req() request: RequestWithUser,
  ) {
    const { user } = request
    this.logger.debug(
      `Change type is '${change.typeName}', change object: ${JSON.stringify(
        change,
      )}`,
    )
    if (!user) {
      throw new Error('User not found')
    }
    return this.changesService.create(change, user)
  }

  @Get('recent')
  async findRecent(
    @Query('limit') limit?: string,
    @Query('page') pageStr?: string,
  ) {
    const pageNum = Math.max(1, Number(pageStr) || 1)
    const lim = Math.min(100, Math.max(1, Number(limit) || 25))
    return this.changesService.findRecent(lim, (pageNum - 1) * lim)
  }

  @Get('gene/:geneId')
  async findByGene(
    @Param('geneId') geneId: string,
    @Query('limit') limit?: string,
    @Query('page') pageStr?: string,
  ) {
    const pageNum = Math.max(1, Number(pageStr) || 1)
    const lim = Math.min(100, Math.max(1, Number(limit) || 25))
    const changes = await this.changesService.findByGeneId(
      geneId,
      lim,
      (pageNum - 1) * lim,
    )
    const total = await this.changesService.countByGeneId(geneId)
    return { changes, total, page: pageNum, limit: lim }
  }

  @Get()
  async findAll(@Query() changeFilter: FindChangeDto) {
    this.logger.debug(`ChangeFilter: ${JSON.stringify(changeFilter)}`)
    return this.changesService.findAll(changeFilter)
  }
}
