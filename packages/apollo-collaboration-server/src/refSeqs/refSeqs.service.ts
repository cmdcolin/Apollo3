import { randomBytes } from 'node:crypto'

import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'

import type { CreateRefSeqDto } from './dto/create-refSeq.dto.js'
import type { FindRefSeqDto } from './dto/find-refSeq.dto.js'
import type { UpdateRefSeqDto } from './dto/update-refSeq.dto.js'

@Injectable()
export class RefSeqsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private readonly logger = new Logger(RefSeqsService.name)

  async create(createRefSeqDto: CreateRefSeqDto) {
    return this.db.refSeq.create({
      _id: randomBytes(12).toString('hex'),
      name: createRefSeqDto.name,
      description: createRefSeqDto.description,
      assembly: createRefSeqDto.assembly,
      length: Number(createRefSeqDto.length),
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
    return this.db.refSeq.updateById(id, {
      ...updateRefSeqDto,
      length:
        updateRefSeqDto.length === undefined
          ? undefined
          : Number(updateRefSeqDto.length),
    })
  }

  async remove(assemblyId: string) {
    await this.db.refSeq.deleteByAssembly(assemblyId)
  }
}
