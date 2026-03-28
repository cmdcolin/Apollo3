import { Controller, Get, Inject, Logger, Param, Query } from '@nestjs/common'

import type { FeatureRangeSearchDto } from '../features/dto/feature-schemas.js'
import { Role } from '../authentication/role.enum.js'
import { Roles } from '../authentication/roles.guard.js'

import { ChecksService } from './checks.service.js'

@Roles(Role.ReadOnly)
@Controller('checks')
export class ChecksController {
  constructor(
    @Inject(ChecksService) private readonly checksService: ChecksService,
  ) {}
  private readonly logger = new Logger(ChecksController.name)

  @Get()
  findAll(@Query() request: { assembly?: string }) {
    // eslint-disable-next-line unicorn/no-array-callback-reference
    return this.checksService.find(request)
  }

  @Get('types')
  getCheckTypes() {
    return this.checksService.getChecks()
  }

  /**
   * Get all possible checkResults for given range (refSeq, start, end)
   * @param searchDto - range
   * @returns an array of checkResult -documents
   */
  @Get('range')
  getFeatures(@Query() request: FeatureRangeSearchDto) {
    this.logger.debug(
      `Get checkResults for refSeq: "${request.refSeq}", start: ${request.start}, end: ${request.end}`,
    )
    return this.checksService.findByRange(request)
  }

  /**
   * Get all possible checkResults for given featureId
   * @param id - featureId
   * @returns - an array of checkResult -documents
   */
  @Get(':id')
  findByFeatureId(@Param('id') id: string) {
    this.logger.debug(`Get checkResults for feature "${id}"`)
    return this.checksService.findByFeatureId(id)
  }
}
