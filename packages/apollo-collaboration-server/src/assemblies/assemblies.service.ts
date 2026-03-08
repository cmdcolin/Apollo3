import { GetAssembliesOperation } from '@apollo-annotation/shared'
import {
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common'
import { randomBytes } from 'node:crypto'
import { FeaturesService } from 'src/features/features.service'
import { RefSeqsService } from 'src/refSeqs/refSeqs.service'

import { ChecksService } from '../checks/checks.service'
import { DatabaseService } from '../mikro-orm/database.service'
import { OperationsService } from '../operations/operations.service'

import { CreateAssemblyDto } from './dto/create-assembly.dto'
import { UpdateAssemblyDto } from './dto/update-assembly.dto'

@Injectable()
export class AssembliesService {
  constructor(
    private readonly operationsService: OperationsService,
    private readonly checksService: ChecksService,
    private readonly featuresService: FeaturesService,
    private readonly refSeqsService: RefSeqsService,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(AssembliesService.name)

  async create(createAssemblyDto: CreateAssemblyDto) {
    return this.db.assembly.create({
      _id: randomBytes(12).toString('hex'),
      name: createAssemblyDto.name,
      displayName: createAssemblyDto.displayName,
      description: createAssemblyDto.description,
      aliases: createAssemblyDto.aliases,
      status: 0,
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
      const features = await this.featuresService.findByRange({
        refSeq: refSeq._id as string,
        start: 0,
        end: refSeq.length,
      })
      for (const feature of features) {
        for (const f of feature) {
          await this.featuresService.checkFeature(f._id.toString(), false)
        }
      }
    }
  }

  findAll() {
    return this.operationsService.executeOperation<GetAssembliesOperation>({
      typeName: 'GetAssembliesOperation',
    })
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
