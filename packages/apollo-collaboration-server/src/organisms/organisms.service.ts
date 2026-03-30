import { organismId } from '@apollo-annotation/common'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'

import type { CreateOrganismDto } from './dto/create-organism.dto.js'
import type { UpdateOrganismDto } from './dto/update-organism.dto.js'

@Injectable()
export class OrganismsService {
  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private readonly logger = new Logger(OrganismsService.name)

  async create(dto: CreateOrganismDto) {
    return this.db.organism.create({
      _id: organismId(),
      taxid: dto.taxid,
      genus: dto.genus,
      species: dto.species,
      commonName: dto.commonName,
      description: dto.description,
    })
  }

  async findAll(opts?: { offset?: number; limit?: number }) {
    return this.db.organism.findAll(opts)
  }

  async findPublic() {
    const publicAssemblies = await this.db.assembly.findPublic()
    const uniqueOrganismIds = [
      ...new Set(publicAssemblies.map((a) => a.organism).filter(Boolean)),
    ]
    const organisms = await Promise.all(
      uniqueOrganismIds.map((id) => this.db.organism.findById(id!)),
    )
    return organisms.filter(Boolean)
  }

  async count() {
    return this.db.organism.count()
  }

  async findOne(id: string) {
    const organism = await this.db.organism.findById(id)
    if (!organism) {
      throw new NotFoundException(`Organism with id "${id}" not found`)
    }
    return organism
  }

  async update(id: string, dto: UpdateOrganismDto) {
    const result = await this.db.organism.updateById(id, dto)
    if (!result) {
      throw new NotFoundException(`Organism with id "${id}" not found`)
    }
    return result
  }

  async remove(id: string) {
    return this.db.organism.deleteById(id)
  }
}
