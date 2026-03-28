import {
  Body,
  Controller,
  Get,
  Inject,
  Logger,
  Param,
  Patch,
  Query,
  Req,
} from '@nestjs/common'

import { PermissionService } from '../permissions/permission.service.js'
import type { RequestWithUser } from '../utils/request-with-user.js'
import { Role } from '../utils/role/role.enum.js'
import { Public, Roles } from '../utils/roles.guard.js'

import type { FindRefSeqDto } from './dto/find-refSeq.dto.js'
import type { UpdateRefSeqDto } from './dto/update-refSeq.dto.js'
import { RefSeqsService } from './refSeqs.service.js'

@Controller('refSeqs')
export class RefSeqsController {
  constructor(
    @Inject(RefSeqsService) private readonly refSeqsService: RefSeqsService,
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
  ) {}

  private readonly logger = new Logger(RefSeqsController.name)

  @Public()
  @Get()
  async findAll(
    @Query() request: FindRefSeqDto,
    @Req() req: RequestWithUser,
  ) {
    this.logger.debug(`refSeqs findAll called with: ${JSON.stringify(request)}`)
    if (request.assembly) {
      await this.permissionService.checkIfUserHasPermissionForAssembly(
        req.user ?? undefined,
        request.assembly,
        Role.ReadOnly,
      )
    }
    return this.refSeqsService.findAll(request)
  }

  @Public()
  @Get(':refseqid')
  findOne(@Param('refseqid') refseqid: string) {
    return this.refSeqsService.findOne(refseqid)
  }

  @Roles(Role.Admin)
  @Patch(':refseqid')
  update(@Param('refseqid') refseqid: string, @Body() body: UpdateRefSeqDto) {
    return this.refSeqsService.update(refseqid, body)
  }
}
