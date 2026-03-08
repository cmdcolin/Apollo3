import { Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ObjectId } from 'mongodb'

import { DatabaseService } from '../mikro-orm/database.service'

import { CreateRefSeqDto } from './dto/create-refSeq.dto'
import { FindRefSeqDto } from './dto/find-refSeq.dto'
import { UpdateRefSeqDto } from './dto/update-refSeq.dto'

@Injectable()
export class RefSeqsService {
  constructor(private readonly db: DatabaseService) {}

  private readonly logger = new Logger(RefSeqsService.name)

  async create(createRefSeqDto: CreateRefSeqDto) {
    return this.db.refSeq.create({
      _id: new ObjectId().toHexString(),
      name: createRefSeqDto.name,
      description: createRefSeqDto.description,
      assembly: createRefSeqDto.assembly,
      length: Number(createRefSeqDto.length),
      chunkSize: 262144,
    })
  }

  async findAll(filter?: FindRefSeqDto) {
    if (filter?.assembly) {
      return this.db.refSeq.findByAssembly(filter.assembly)
    }
    return this.db.refSeq.findAll()
  }

  async findOne(id: string) {
    const refSeq = await this.db.refSeq.findById(id)
    if (!refSeq) {
      throw new NotFoundException(`RefSeq with id "${id}" not found`)
    }
    return refSeq
  }

  async update(id: string, updateRefSeqDto: UpdateRefSeqDto) {
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

  async remove(id: string) {
    const refSeq = await this.db.refSeq.findById(id)
    if (refSeq) {
      await this.db.refSeq.deleteByAssembly(refSeq.assembly)
    }
  }
}
