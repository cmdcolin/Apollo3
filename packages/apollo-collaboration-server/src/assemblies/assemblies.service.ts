/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import {
  Assembly,
  AssemblyDocument,
  Check,
  CheckDocument,
} from '@apollo-annotation/schemas'
import { GetAssembliesOperation } from '@apollo-annotation/shared'
import {
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  UnprocessableEntityException,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ObjectId } from 'mongodb'
import { Model } from 'mongoose'
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
    @Optional()
    @InjectModel(Assembly.name)
    private readonly assemblyModel: Model<AssemblyDocument>,
    @Optional()
    @InjectModel(Check.name)
    private readonly checkModel: Model<CheckDocument>,
    private readonly operationsService: OperationsService,
    private readonly checksService: ChecksService,
    private readonly featuresService: FeaturesService,
    private readonly refSeqsService: RefSeqsService,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(AssembliesService.name)

  async create(createAssemblyDto: CreateAssemblyDto) {
    if (this.db.useV2Backend) {
      return this.db.assembly.create({
        _id: new ObjectId().toHexString(),
        name: createAssemblyDto.name,
        displayName: createAssemblyDto.displayName,
        description: createAssemblyDto.description,
        aliases: createAssemblyDto.aliases,
        status: 0,
      })
    }
    return this.assemblyModel.create(createAssemblyDto)
  }

  async updateChecks(_id: string, checks: string[]) {
    if (this.db.useV2Backend) {
      await this.db.assembly.updateById(_id, { checks })
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
    if (this.db.useV2Backend) {
      const assembly = await this.db.assembly.findById(id)
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

  async update(id: string, updateAssemblyDto: UpdateAssemblyDto) {
    if (this.db.useV2Backend) {
      return this.db.assembly.updateById(id, updateAssemblyDto)
    }
    return this.assemblyModel
      .findByIdAndUpdate({ id, status: 0 }, updateAssemblyDto, {
        runValidators: true,
      })
      .exec()
  }

  async remove(id: string) {
    if (this.db.useV2Backend) {
      return this.db.assembly.deleteById(id)
    }
    return this.assemblyModel.findByIdAndDelete(id).exec()
  }
}
