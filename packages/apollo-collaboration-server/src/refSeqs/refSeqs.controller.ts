import { Controller, Get, Logger, Param, Query } from '@nestjs/common'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { FindRefSeqDto } from './dto/find-refSeq.dto.js'
import { RefSeqsService } from './refSeqs.service.js'

@Roles(Role.ReadOnly)
@Controller('refSeqs')
export class RefSeqsController {
  constructor(private readonly refSeqsService: RefSeqsService) {}

  private readonly logger = new Logger(RefSeqsController.name)

  @Get()
  findAll(@Query() request: FindRefSeqDto) {
    this.logger.debug(`refSeqs findAll called with: ${JSON.stringify(request)}`)
    return this.refSeqsService.findAll(request)
  }

  @Get(':refseqid')
  getFeature(@Param('refseqid') refseqid: string) {
    return this.refSeqsService.findOne(refseqid)
  }
}
