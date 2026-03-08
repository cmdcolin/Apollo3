/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import { RefSeq, RefSeqDocument } from '@apollo-annotation/schemas'
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { ObjectId } from 'mongodb'
import { Model } from 'mongoose'

import { DatabaseService } from '../mikro-orm/database.service'

import { CreateRefSeqDto } from './dto/create-refSeq.dto'
import { FindRefSeqDto } from './dto/find-refSeq.dto'
import { UpdateRefSeqDto } from './dto/update-refSeq.dto'

@Injectable()
export class RefSeqsService {
  constructor(
    @Optional()
    @InjectModel(RefSeq.name)
    private readonly refSeqModel: Model<RefSeqDocument>,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(RefSeqsService.name)

  async create(createRefSeqDto: CreateRefSeqDto) {
    if (this.db.useV2Backend) {
      return this.db.refSeq.create({
        _id: new ObjectId().toHexString(),
        name: createRefSeqDto.name,
        description: createRefSeqDto.description,
        assembly: createRefSeqDto.assembly,
        length: Number(createRefSeqDto.length),
        chunkSize: 262144,
      })
    }
    return this.refSeqModel.create(createRefSeqDto)
  }

  async findAll(filter?: FindRefSeqDto) {
    if (this.db.useV2Backend) {
      if (filter?.assembly) {
        return this.db.refSeq.findByAssembly(filter.assembly)
      }
      return this.db.refSeq.findAll()
    }
    // eslint-disable-next-line unicorn/no-array-callback-reference
    return this.refSeqModel.find(filter ?? {}).exec()
  }

  async findOne(id: string) {
    if (this.db.useV2Backend) {
      const refSeq = await this.db.refSeq.findById(id)
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

  async update(id: string, updateRefSeqDto: UpdateRefSeqDto) {
    if (this.db.useV2Backend) {
      const data: Partial<{
        name: string
        description: string
        length: number
        assembly: string
      }> = {}
      if (updateRefSeqDto.name !== undefined) {
        data.name = updateRefSeqDto.name
      }
      if (updateRefSeqDto.description !== undefined) {
        data.description = updateRefSeqDto.description
      }
      if (updateRefSeqDto.length !== undefined) {
        data.length = Number(updateRefSeqDto.length)
      }
      if (updateRefSeqDto.assembly !== undefined) {
        data.assembly = updateRefSeqDto.assembly
      }
      return this.db.refSeq.updateById(id, data)
    }
    return this.refSeqModel
      .findByIdAndUpdate(id, updateRefSeqDto, { runValidators: true })
      .exec()
  }

  async remove(id: string) {
    if (this.db.useV2Backend) {
      const refSeq = await this.db.refSeq.findById(id)
      if (refSeq) {
        await this.db.refSeq.deleteByAssembly(refSeq.assembly)
      }
      return
    }
    return this.refSeqModel.findByIdAndDelete(id).exec()
  }
}
