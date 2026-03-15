import { randomBytes } from 'node:crypto'

import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'

import { ChecksService } from '../checks/checks.service.js'
import { FeaturesService } from '../features/features.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { RefSeqsService } from '../refSeqs/refSeqs.service.js'

import { CreateAssemblyDto } from './dto/create-assembly.dto.js'
import { UpdateAssemblyDto } from './dto/update-assembly.dto.js'

@Injectable()
export class AssembliesService {
  constructor(
    @Inject(ChecksService) private readonly checksService: ChecksService,
    @Inject(FeaturesService) private readonly featuresService: FeaturesService,
    @Inject(RefSeqsService) private readonly refSeqsService: RefSeqsService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(AssembliesService.name)

  async create(createAssemblyDto: CreateAssemblyDto) {
    const defaultChecks = await this.db.checkConfig.findDefaults()
    const defaultCheckIds = defaultChecks.map((c) => c._id)
    return this.db.assembly.create({
      _id: randomBytes(12).toString('hex'),
      name: createAssemblyDto.name,
      displayName: createAssemblyDto.displayName,
      description: createAssemblyDto.description,
      aliases: createAssemblyDto.aliases,
      checks: defaultCheckIds,
      organism: createAssemblyDto.organism,
    })
  }

  async updateChecks(_id: string, checks: string[]) {
    await this.db.assembly.updateById(_id, { checks })

    const checkResults = await this.checksService.find({ assembly: _id })
    const obsoleteCheckIds = checkResults
      .filter((x) => !checks.includes(x.name))
      .map((x) => x._id)
    await this.checksService.deleteChecks(obsoleteCheckIds)

    const refSeqs = await this.refSeqsService.findAll({ assembly: _id })
    for (const refSeq of refSeqs) {
      const [features] = await this.featuresService.findByRange({
        refSeq: refSeq._id,
        start: 0,
        end: refSeq.length,
      })
      for (const feature of features) {
        await this.featuresService.checkFeature(feature._id.toString(), false)
      }
    }
  }

  async findAll() {
    return this.db.assembly.findAll()
  }

  async findOne(id: string) {
    const assembly = await this.db.assembly.findById(id)
    if (!assembly) {
      throw new NotFoundException(`Assembly with id "${id}" not found`)
    }
    return assembly
  }

  async update(id: string, updateAssemblyDto: UpdateAssemblyDto) {
    return this.db.assembly.updateById(id, updateAssemblyDto)
  }

  async remove(id: string) {
    return this.db.assembly.deleteById(id)
  }
}
