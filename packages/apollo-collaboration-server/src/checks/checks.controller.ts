import { Controller, Get, Inject, Logger, NotFoundException, Param, Query } from '@nestjs/common'

import type { FeatureRangeSearchDto } from '../features/dto/feature-schemas.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { Role } from '../authentication/role.enum.js'
import { Roles } from '../authentication/roles.guard.js'

import { ChecksService } from './checks.service.js'

@Roles(Role.ReadOnly)
@Controller('checks')
export class ChecksController {
  constructor(
    @Inject(ChecksService) private readonly checksService: ChecksService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
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

  @Get('range')
  async getFeatures(@Query() request: FeatureRangeSearchDto) {
    this.logger.debug(
      `Get checkResults for assembly: "${request.assembly}", refSeq: "${request.refSeq}", start: ${request.start}, end: ${request.end}`,
    )
    const assembly = await this.db.assembly.findByName(request.assembly)
    if (!assembly) {
      throw new NotFoundException(`Assembly "${request.assembly}" not found`)
    }
    return this.checksService.findByRange({
      ...request,
      assembly: assembly._id,
    })
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
