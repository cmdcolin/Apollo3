import type { FileRepository, FileRow } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { FileEntity, type FileType } from '../entities/FileEntity.js'

function toRow(entity: InferEntity<typeof FileEntity>): FileRow {
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
    return
  }

  async findByChecksum(checksum: string) {
    const entity = await this.em.findOne(FileEntity, { checksum })
    if (entity) {
      return toRow(entity)
    }
    return
  }

  async findAll() {
    const entities = await this.em.find(FileEntity, {}, {})
    return entities.map((x) => toRow(x))
  }

  async create(row: FileRow) {
    const entity = this.em.create(FileEntity, {
      _id: row._id,
      basename: row.basename,
      checksum: row.checksum,
      type: row.type as FileType,
    })
    this.em.persist(entity)
    await this.em.flush()
    return toRow(entity)
  }

  async deleteById(id: string) {
    const entity = await this.em.findOne(FileEntity, { _id: id })
    if (!entity) {
      return false
    }
    this.em.remove(entity)
    await this.em.flush()
    return true
  }
}
