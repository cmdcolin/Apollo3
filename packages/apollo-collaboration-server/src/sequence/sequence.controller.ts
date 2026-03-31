import { Controller, Get, Inject, Logger, NotFoundException, Query, Req } from '@nestjs/common'

import { PermissionService } from '../permissions/permission.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
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
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(SequenceController.name)

  @Get()
  async getSequence(
    @Query() request: GetSequenceDto,
    @Req() req: RequestWithUser,
  ) {
    this.logger.debug(`getSequence: ${JSON.stringify(request)}`)
    const assembly = await this.db.assembly.findByName(request.assembly)
    if (!assembly) {
      throw new NotFoundException(`Assembly "${request.assembly}" not found`)
    }
    await this.permissionService.checkIfUserHasPermissionForAssembly(
      req.user,
      assembly._id,
      Role.ReadOnly,
    )
    return this.sequenceService.getSequence(request)
  }
}
