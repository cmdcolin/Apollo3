import type { CounterRepository } from '@apollo-annotation/common'
import type { EntityManager, InferEntity } from '@mikro-orm/core'

import { CounterEntity } from '../entities/CounterEntity.js'

export class MikroOrmCounterRepository implements CounterRepository {
  constructor(private readonly em: EntityManager) {}

  async getNextSequenceValue(sequenceName: string) {
    let counter = await this.em.findOne(CounterEntity, { _id: sequenceName })
    if (counter) {
      counter.sequenceValue++
    } else {
      counter = this.em.create(CounterEntity, {
        _id: sequenceName,
        sequenceValue: 1,
      } satisfies InferEntity<typeof CounterEntity>)
    }
    await this.em.flush()
    return counter.sequenceValue
  }
}
