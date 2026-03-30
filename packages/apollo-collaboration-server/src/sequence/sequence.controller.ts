import { Controller, Get, Inject, Logger, Query, Req } from '@nestjs/common'

import { PermissionService } from '../permissions/permission.service.js'
import type { RequestWithUser } from '../authentication/request-with-user.js'
import { Role } from '../authentication/role.enum.js'
import { Public } from '../authentication/roles.guard.js'

import type { GetSequenceDto } from './dto/get-sequence.dto.js'
import { SequenceService } from './sequence.service.js'

@Public()
@Controller('sequence')
export class SequenceController {
  constructor(
    @Inject(SequenceService) private readonly sequenceService: SequenceService,
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
  ) {}

  private readonly logger = new Logger(SequenceController.name)

  @Get()
  async getSequence(
    @Query() request: GetSequenceDto,
    @Req() req: RequestWithUser,
  ) {
    this.logger.debug(`getSequence: ${JSON.stringify(request)}`)
    await this.permissionService.checkRefSeqPermission(
      req.user,
      request.refSeq,
      Role.ReadOnly,
    )
    return this.sequenceService.getSequence(request)
  }
}
