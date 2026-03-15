import { Controller, Get, Inject, Logger, Query } from '@nestjs/common'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { GetSequenceDto } from './dto/get-sequence.dto.js'
import { SequenceService } from './sequence.service.js'

@Roles(Role.ReadOnly)
@Controller('sequence')
export class SequenceController {
  constructor(@Inject(SequenceService) private readonly sequenceService: SequenceService) {}

  private readonly logger = new Logger(SequenceController.name)

  @Get()
  getSequence(@Query() request: GetSequenceDto) {
    this.logger.debug(`getSequence: ${JSON.stringify(request)}`)
    return this.sequenceService.getSequence(request)
  }
}
