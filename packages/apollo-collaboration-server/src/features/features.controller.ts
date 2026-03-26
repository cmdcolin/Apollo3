import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  ParseBoolPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common'

import type {
  FeatureIdsSearchDto,
  FeatureRangeSearchDto,
} from '../entity/gff3Object.dto.js'
import type { RequestWithUser } from '../utils/request-with-user.js'
import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import type {
  FeatureCountRequest,
  GetByIndexedIdRequest,
} from './dto/feature.dto.js'
import {
  type AddFeatureDto,
  type FeatureUpdateDto,
  FeaturesService,
  type MergeExonsDto,
  type MergeTranscriptsDto,
  type SplitExonDto,
  type SplitTranscriptDto,
} from './features.service.js'

@Controller('features')
export class FeaturesController {
  constructor(
    @Inject(FeaturesService) private readonly featuresService: FeaturesService,
  ) {}
  private readonly logger = new Logger(FeaturesController.name)

  // --- Read endpoints (ReadOnly role) ---

  @Roles(Role.ReadOnly)
  @Get('searchFeatures')
  async searchFeatures(@Query() request: { term: string; assemblies: string }) {
    return this.featuresService.searchFeatures(request)
  }

  @Roles(Role.ReadOnly)
  @Get('getFeatures')
  getFeaturesByRange(@Query() request: FeatureRangeSearchDto) {
    this.logger.debug(
      `getFeatures endpoint: refSeq: ${request.refSeq}, start: ${request.start}, end: ${request.end}`,
    )
    return this.featuresService.findFeaturesByRange(request)
  }

  @Roles(Role.ReadOnly)
  @Post('getByIds')
  findByFeatureIds(@Body() request: FeatureIdsSearchDto) {
    this.logger.debug(`: featureIds: ${JSON.stringify(request.featureIds)}`)
    return this.featuresService.findByFeatureIds(
      request.featureIds,
      request.topLevel,
    )
  }

  @Roles(Role.ReadOnly)
  @Get('count')
  async getFeatureCount(@Query() featureCountRequest: FeatureCountRequest) {
    this.logger.debug(
      `Get features count by ${JSON.stringify(featureCountRequest)}`,
    )
    const count =
      await this.featuresService.getFeatureCount(featureCountRequest)
    return { count }
  }

  @Roles(Role.ReadOnly)
  @Get('getByIndexedId')
  async getById(@Query() getByIndexedIdRequest: GetByIndexedIdRequest) {
    return this.featuresService.getByIndexedId(getByIndexedIdRequest)
  }

  @Roles(Role.ReadOnly)
  @Get('check/:featureid')
  checkFeature(@Param('featureid') featureid: string) {
    return this.featuresService.checkFeature(featureid)
  }

  @Roles(Role.ReadOnly)
  @Get()
  getAll() {
    this.logger.debug('Get all features')
    return this.featuresService.findAll()
  }

  // --- Mutation endpoints (User role) ---

  @Roles(Role.User)
  @Patch(':featureid')
  async updateFeature(
    @Param('featureid') featureid: string,
    @Body() dto: FeatureUpdateDto,
    @Req() request: RequestWithUser,
  ) {
    const { user } = request
    if (!user) {
      throw new Error('User not found on request')
    }
    return this.featuresService.updateFeature(featureid, dto, user)
  }

  @Roles(Role.User)
  @Post()
  async addFeature(
    @Body() dto: AddFeatureDto,
    @Req() request: RequestWithUser,
  ) {
    const { user } = request
    if (!user) {
      throw new Error('User not found on request')
    }
    return this.featuresService.addFeature(dto, user)
  }

  @Roles(Role.User)
  @Delete(':featureid')
  async deleteFeature(
    @Param('featureid') featureid: string,
    @Req() request: RequestWithUser,
  ) {
    const { user } = request
    if (!user) {
      throw new Error('User not found on request')
    }
    return this.featuresService.deleteFeature(featureid, user)
  }

  @Roles(Role.User)
  @Post('merge-exons')
  async mergeExons(
    @Body() dto: MergeExonsDto,
    @Req() request: RequestWithUser,
  ) {
    const { user } = request
    if (!user) {
      throw new Error('User not found on request')
    }
    return this.featuresService.mergeExons(dto, user)
  }

  @Roles(Role.User)
  @Post('split-exon')
  async splitExon(
    @Body() dto: SplitExonDto,
    @Req() request: RequestWithUser,
  ) {
    const { user } = request
    if (!user) {
      throw new Error('User not found on request')
    }
    return this.featuresService.splitExon(dto, user)
  }

  @Roles(Role.User)
  @Post('merge-transcripts')
  async mergeTranscripts(
    @Body() dto: MergeTranscriptsDto,
    @Req() request: RequestWithUser,
  ) {
    const { user } = request
    if (!user) {
      throw new Error('User not found on request')
    }
    return this.featuresService.mergeTranscripts(dto, user)
  }

  @Roles(Role.User)
  @Post('split-transcript')
  async splitTranscript(
    @Body() dto: SplitTranscriptDto,
    @Req() request: RequestWithUser,
  ) {
    const { user } = request
    if (!user) {
      throw new Error('User not found on request')
    }
    return this.featuresService.splitTranscript(dto, user)
  }

  @Roles(Role.User)
  @Post('undo')
  async undo(
    @Body() body: { sequence: number },
    @Req() request: RequestWithUser,
  ) {
    const { user } = request
    if (!user) {
      throw new Error('User not found on request')
    }
    return this.featuresService.undoChange(body.sequence, user)
  }

  // Keep single-feature GET last to avoid route conflicts
  @Roles(Role.ReadOnly)
  @Get(':featureid')
  getFeature(
    @Param('featureid') featureid: string,
    @Query('topLevel', new ParseBoolPipe({ optional: true }))
    topLevel: boolean | undefined,
  ) {
    this.logger.debug(`Get feature by featureId: ${featureid}`)
    return this.featuresService.findById(featureid, topLevel)
  }
}
