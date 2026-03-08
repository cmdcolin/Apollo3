import type { FileRepository, FileRow } from '@apollo-annotation/common'
import type { EntityManager } from '@mikro-orm/core'

import { FileEntity, FileType } from '../entities/FileEntity.js'

function toRow(entity: FileEntity): FileRow {
  return {
    _id: entity._id,
    basename: entity.basename,
    checksum: entity.checksum,
    type: entity.type as FileRow['type'],
  }
}

export class MikroOrmFileRepository implements FileRepository {
  constructor(private readonly em: EntityManager) {}

  async findById(id: string) {
    const entity = await this.em.findOne(FileEntity, { _id: id })
    if (entity) {
      return toRow(entity)
    }
    return undefined
  }

  async findByChecksum(checksum: string) {
    const entity = await this.em.findOne(FileEntity, { checksum })
    if (entity) {
      return toRow(entity)
    }
    return undefined
  }

  async findAll() {
    const entities = await this.em.find(FileEntity, {})
    return entities.map(toRow)
  }

  async create(row: FileRow) {
    const entity = this.em.create(FileEntity, {
      _id: row._id,
      basename: row.basename,
      checksum: row.checksum,
      type: row.type as FileType,
    })
    await this.em.persistAndFlush(entity)
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(FileEntity, { _id: id })
    if (!entity) {
      return false
    }
    await this.em.removeAndFlush(entity)
    return true
  }
}
