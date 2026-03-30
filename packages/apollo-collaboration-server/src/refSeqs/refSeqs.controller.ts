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

import { DatabaseService } from '../mikro-orm/database.service.js'
import { PermissionService } from '../permissions/permission.service.js'
import type { RequestWithUser } from '../authentication/request-with-user.js'
import { Role } from '../authentication/role.enum.js'
import { Public, Roles } from '../authentication/roles.guard.js'

import type { FindRefSeqDto } from './dto/find-refSeq.dto.js'
import type { UpdateRefSeqDto } from './dto/update-refSeq.dto.js'
import { RefSeqsService } from './refSeqs.service.js'

@Public()
@Controller('refSeqs')
export class RefSeqsController {
  constructor(
    @Inject(RefSeqsService) private readonly refSeqsService: RefSeqsService,
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(RefSeqsController.name)

  @Public()
  @Get()
  async findAll(
    @Query() request: FindRefSeqDto,
    @Req() req: RequestWithUser,
  ) {
    this.logger.debug(
      `refSeqs findAll: query=${JSON.stringify(request)}, userId=${req.user?.id ?? 'none'}, userRole=${req.user?.role ?? 'none'}`,
    )
    if (request.assembly) {
      const assembly = await this.db.assembly.findByName(request.assembly)
      if (!assembly) {
        return []
      }
      await this.permissionService.checkIfUserHasPermissionForAssembly(
        req.user ?? undefined,
        assembly._id,
        Role.ReadOnly,
      )
      return this.refSeqsService.findAll({ assembly: assembly._id })
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
