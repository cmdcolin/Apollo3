/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { type RefSeqRepository } from '@apollo-annotation/common'
import { MikroOrmRefSeqRepository } from '@apollo-annotation/entities'
import { RefSeq, RefSeqDocument } from '@apollo-annotation/schemas'
import { EntityManager } from '@mikro-orm/core'
import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { Model } from 'mongoose'

import { CreateRefSeqDto } from './dto/create-refSeq.dto'
import { FindRefSeqDto } from './dto/find-refSeq.dto'
import { UpdateRefSeqDto } from './dto/update-refSeq.dto'

@Injectable()
export class RefSeqsService {
  constructor(
    @InjectModel(RefSeq.name)
    private readonly refSeqModel: Model<RefSeqDocument>,
    @Optional() @Inject(EntityManager) private readonly em?: EntityManager,
  ) {}

  private readonly logger = new Logger(RefSeqsService.name)

  private get useV2Backend() {
    const dbBackend = process.env.DB_BACKEND
    return dbBackend && dbBackend !== 'mongodb' && this.em !== undefined
  }

  private get refSeqRepository(): RefSeqRepository {
    if (!this.em) {
      throw new Error('EntityManager not available')
    }
    return new MikroOrmRefSeqRepository(this.em.fork())
  }

  create(createRefSeqDto: CreateRefSeqDto) {
    return this.refSeqModel.create(createRefSeqDto)
  }

  async findAll(filter?: FindRefSeqDto) {
    if (this.useV2Backend) {
      if (filter?.assembly) {
        return this.refSeqRepository.findByAssembly(filter.assembly)
      }
      return this.refSeqRepository.findAll()
    }
    // eslint-disable-next-line unicorn/no-array-callback-reference
    return this.refSeqModel.find(filter ?? {}).exec()
  }

  async findOne(id: string) {
    if (this.useV2Backend) {
      const refSeq = await this.refSeqRepository.findById(id)
      if (!refSeq) {
        throw new NotFoundException(`RefSeq with id "${id}" not found`)
      }
      return refSeq
    }
    const refSeq = await this.refSeqModel.findById(id).exec()
    if (!refSeq) {
      throw new NotFoundException(`RefSeq with id "${id}" not found`)
    }
    return refSeq
  }

  update(id: string, updateRefSeqDto: UpdateRefSeqDto) {
    return this.refSeqModel
      .findByIdAndUpdate(id, updateRefSeqDto, { runValidators: true })
      .exec()
  }

  remove(id: string) {
    return this.refSeqModel.findByIdAndDelete(id).exec()
  }
}
