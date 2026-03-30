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
import type { RequestWithUser } from '../authentication/request-with-user.js'
import { Role } from '../authentication/role.enum.js'
import { Public, Roles } from '../authentication/roles.guard.js'
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

@Roles(Role.ReadOnly)
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
      req.user,
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

  // All mutation endpoints below are guarded by @Roles(Role.User), which
  // guarantees request.user is set before the handler runs.

  @Roles(Role.User)
  @Patch(':featureid')
  updateFeature(
    @Param('featureid') featureid: string,
    @Body(new ZodValidationPipe(featureUpdateSchema)) dto: FeatureUpdateDto,
    @Req() request: RequestWithUser,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.featuresService.updateFeature(featureid, dto, request.user!)
  }

  @Roles(Role.User)
  @Post()
  addFeature(
    @Body(new ZodValidationPipe(addFeatureSchema)) dto: AddFeatureDto,
    @Req() request: RequestWithUser,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.featuresService.addFeature(dto, request.user!)
  }

  @Roles(Role.User)
  @Delete(':featureid')
  deleteFeature(
    @Param('featureid') featureid: string,
    @Req() request: RequestWithUser,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.featuresService.deleteFeature(featureid, request.user!)
  }

  @Roles(Role.User)
  @Post('merge-exons')
  mergeExons(
    @Body(new ZodValidationPipe(mergeExonsSchema)) dto: MergeExonsDto,
    @Req() request: RequestWithUser,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.featuresService.mergeExons(dto, request.user!)
  }

  @Roles(Role.User)
  @Post('split-exon')
  splitExon(
    @Body(new ZodValidationPipe(splitExonSchema)) dto: SplitExonDto,
    @Req() request: RequestWithUser,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.featuresService.splitExon(dto, request.user!)
  }

  @Roles(Role.User)
  @Post('merge-transcripts')
  mergeTranscripts(
    @Body(new ZodValidationPipe(mergeTranscriptsSchema))
    dto: MergeTranscriptsDto,
    @Req() request: RequestWithUser,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.featuresService.mergeTranscripts(dto, request.user!)
  }

  @Roles(Role.User)
  @Post('split-transcript')
  splitTranscript(
    @Body(new ZodValidationPipe(splitTranscriptSchema))
    dto: SplitTranscriptDto,
    @Req() request: RequestWithUser,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.featuresService.splitTranscript(dto, request.user!)
  }

  @Roles(Role.User)
  @Post('undo')
  undo(
    @Body(new ZodValidationPipe(undoSchema)) body: { sequence: number },
    @Req() request: RequestWithUser,
  ) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    return this.featuresService.undoChange(body.sequence, request.user!)
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
