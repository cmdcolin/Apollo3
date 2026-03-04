/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type { AssemblyRepository } from '@apollo-annotation/common'
import { MikroOrmAssemblyRepository } from '@apollo-annotation/entities'
import {
  Assembly,
  AssemblyDocument,
  Check,
  CheckDocument,
} from '@apollo-annotation/schemas'
import { GetAssembliesOperation } from '@apollo-annotation/shared'
import { EntityManager } from '@mikro-orm/core'
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'
import { FeaturesService } from 'src/features/features.service'
import { RefSeqsService } from 'src/refSeqs/refSeqs.service'

import { ChecksService } from '../checks/checks.service'
import { OperationsService } from '../operations/operations.service'

import { CreateAssemblyDto } from './dto/create-assembly.dto'
import { UpdateAssemblyDto } from './dto/update-assembly.dto'

@Injectable()
export class AssembliesService {
  constructor(
    @InjectModel(Assembly.name)
    private readonly assemblyModel: Model<AssemblyDocument>,
    @InjectModel(Check.name)
    private readonly checkModel: Model<CheckDocument>,
    private readonly operationsService: OperationsService,
    private readonly checksService: ChecksService,
    private readonly featuresService: FeaturesService,
    private readonly refSeqsService: RefSeqsService,
    @Optional() @Inject(EntityManager) private readonly em?: EntityManager,
  ) {}

  private readonly logger = new Logger(AssembliesService.name)

  private get useV2Backend() {
    const dbBackend = process.env.DB_BACKEND
    return dbBackend && dbBackend !== 'mongodb' && this.em !== undefined
  }

  private get assemblyRepository(): AssemblyRepository {
    if (!this.em) {
      throw new Error('EntityManager not available')
    }
    return new MikroOrmAssemblyRepository(this.em.fork())
  }

  async create(createAssemblyDto: CreateAssemblyDto) {
    return this.assemblyModel.create(createAssemblyDto)
  }

  async updateChecks(_id: string, checks: string[]) {
    if (this.useV2Backend) {
      await this.assemblyRepository.updateById(_id, { checks })
    } else {
      try {
        await this.assemblyModel.updateOne(
          { $and: [{ _id, status: 0 }] },
          { $set: { checks } },
        )
      } catch (error) {
        this.logger.debug(
          '*** UPDATE STATUS EXCEPTION - Could not update checks in assembly document!',
        )
        throw new UnprocessableEntityException(String(error))
      }
    }

    // Delete checks that are no longer registered
    const checkResults = await this.checksService.find({ assembly: _id })
    const obsoleteCheckIds = checkResults
      .filter((x) => !checks.includes(x.name))
      .map((x) => x._id)
    await this.checksService.deleteChecks(obsoleteCheckIds)

    // Get features in assembly and apply the new checks
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
    if (this.useV2Backend) {
      const assembly = await this.assemblyRepository.findById(id)
      if (!assembly) {
        throw new NotFoundException(`Assembly with id "${id}" not found`)
      }
      return assembly
    }
    const assembly = await this.assemblyModel
      .findOne({ _id: id, status: 0 })
      .exec()
    if (!assembly) {
      throw new NotFoundException(`Assembly with id "${id}" not found`)
    }
    return assembly
  }

  update(id: string, updateAssemblyDto: UpdateAssemblyDto) {
    return this.assemblyModel
      .findByIdAndUpdate({ id, status: 0 }, updateAssemblyDto, {
        runValidators: true,
      })
      .exec()
  }

  remove(id: string) {
    return this.assemblyModel.findByIdAndDelete(id).exec()
  }
}
