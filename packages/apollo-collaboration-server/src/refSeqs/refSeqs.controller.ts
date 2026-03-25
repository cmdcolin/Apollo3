import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Query,
} from '@nestjs/common'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import type { FindRefSeqDto } from './dto/find-refSeq.dto.js'
import type { UpdateRefSeqDto } from './dto/update-refSeq.dto.js'
import { RefSeqsService } from './refSeqs.service.js'

@Roles(Role.ReadOnly)
@Controller('refSeqs')
export class RefSeqsController {
  constructor(
    @Inject(RefSeqsService) private readonly refSeqsService: RefSeqsService,
  ) {}

  private readonly logger = new Logger(RefSeqsController.name)

  @Get()
  findAll(@Query() request: FindRefSeqDto) {
    this.logger.debug(`refSeqs findAll called with: ${JSON.stringify(request)}`)
    return this.refSeqsService.findAll(request)
  }

  @Get(':refseqid')
  findOne(@Param('refseqid') refseqid: string) {
    return this.refSeqsService.findOne(refseqid)
  }

  @Patch(':refseqid')
  @Roles(Role.Admin)
  update(@Param('refseqid') refseqid: string, @Body() body: UpdateRefSeqDto) {
    return this.refSeqsService.update(refseqid, body)
  }
}
