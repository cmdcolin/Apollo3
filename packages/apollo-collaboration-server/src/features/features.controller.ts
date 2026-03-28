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
  UsePipes,
} from '@nestjs/common'

import { PermissionService } from '../permissions/permission.service.js'
import type { RequestWithUser } from '../utils/request-with-user.js'
import { Role } from '../utils/role/role.enum.js'
import { Public, Roles } from '../utils/roles.guard.js'
import { ZodValidationPipe } from '../utils/zod-validation.pipe.js'

import {
  type AddFeatureDto,
  type FeatureUpdateDto,
  type MergeExonsDto,
  type MergeTranscriptsDto,
  type SplitExonDto,
  type SplitTranscriptDto,
  addFeatureSchema,
  featureCountSchema,
  featureIdsSearchSchema,
  featureRangeSearchSchema,
  featureUpdateSchema,
  getByIndexedIdSchema,
  mergeExonsSchema,
  mergeTranscriptsSchema,
  splitExonSchema,
  splitTranscriptSchema,
  undoSchema,
} from './dto/feature-schemas.js'
import { FeaturesService } from './features.service.js'

@Controller('features')
export class FeaturesController {
  constructor(
    @Inject(FeaturesService) private readonly featuresService: FeaturesService,
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
  ) {}
  private readonly logger = new Logger(FeaturesController.name)

  // --- Read endpoints (public for public assemblies, ReadOnly for private) ---

  @Public()
  @Get('searchFeatures')
  async searchFeatures(@Query() request: { term: string; assemblies: string }) {
    return this.featuresService.searchFeatures(request)
  }

  @Public()
  @Get('getFeatures')
  @UsePipes(new ZodValidationPipe(featureRangeSearchSchema))
  async getFeaturesByRange(
    @Query() request: { refSeq: string; start: number; end: number },
    @Req() req: RequestWithUser,
  ) {
    this.logger.debug(
      `getFeatures endpoint: refSeq: ${request.refSeq}, start: ${request.start}, end: ${request.end}`,
    )
    await this.permissionService.checkRefSeqPermission(
      req.user ?? undefined,
      request.refSeq,
      Role.ReadOnly,
    )
    return this.featuresService.findFeaturesByRange(request)
  }

  @Roles(Role.ReadOnly)
  @Post('getByIds')
  @UsePipes(new ZodValidationPipe(featureIdsSearchSchema))
  findByFeatureIds(@Body() request: { featureIds: string[]; topLevel?: boolean }) {
    this.logger.debug(`: featureIds: ${JSON.stringify(request.featureIds)}`)
    return this.featuresService.findByFeatureIds(
      request.featureIds,
      request.topLevel,
    )
  }

  @Roles(Role.ReadOnly)
  @Get('count')
  @UsePipes(new ZodValidationPipe(featureCountSchema))
  async getFeatureCount(
    @Query()
    featureCountRequest: {
      assemblyId?: string
      refSeqId?: string
      start?: number
      end?: number
    },
  ) {
    this.logger.debug(
      `Get features count by ${JSON.stringify(featureCountRequest)}`,
    )
    const count =
      await this.featuresService.getFeatureCount(featureCountRequest)
    return { count }
  }

  @Roles(Role.ReadOnly)
  @Get('getByIndexedId')
  @UsePipes(new ZodValidationPipe(getByIndexedIdSchema))
  async getById(
    @Query()
    getByIndexedIdRequest: {
      id: string
      assemblies?: string
      topLevel?: boolean
    },
  ) {
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
    @Body(new ZodValidationPipe(featureUpdateSchema)) dto: FeatureUpdateDto,
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
    @Body(new ZodValidationPipe(addFeatureSchema)) dto: AddFeatureDto,
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
    @Body(new ZodValidationPipe(mergeExonsSchema)) dto: MergeExonsDto,
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
    @Body(new ZodValidationPipe(splitExonSchema)) dto: SplitExonDto,
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
    @Body(new ZodValidationPipe(mergeTranscriptsSchema))
    dto: MergeTranscriptsDto,
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
    @Body(new ZodValidationPipe(splitTranscriptSchema))
    dto: SplitTranscriptDto,
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
    @Body(new ZodValidationPipe(undoSchema)) body: { sequence: number },
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
