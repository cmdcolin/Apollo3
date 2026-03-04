import { type CounterRepository } from '@apollo-annotation/common'
import type { EntityManager } from '@mikro-orm/core'

import { CounterEntity } from '../entities/CounterEntity'

export class MikroOrmCounterRepository implements CounterRepository {
  constructor(private readonly em: EntityManager) {}

  async getNextSequenceValue(sequenceName: string) {
    let entity = await this.em.findOne(CounterEntity, { _id: sequenceName })
    if (entity) {
      entity.sequenceValue += 1
    } else {
      entity = this.em.create(CounterEntity, {
        _id: sequenceName,
        sequenceValue: 1,
      })
      this.em.persist(entity)
    }
    await this.em.flush()
    return entity.sequenceValue
  }
}
