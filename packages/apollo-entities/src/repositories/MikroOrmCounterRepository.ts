import type { CounterRepository } from '@apollo-annotation/common'
import { LockMode, type EntityManager, type InferEntity } from '@mikro-orm/core'

import { CounterEntity } from '../entities/CounterEntity.js'

export class MikroOrmCounterRepository implements CounterRepository {
  constructor(private readonly em: EntityManager) {}

  // Atomically increments a named counter and returns the new value.
  // Used to generate unique, monotonically increasing sequence numbers
  // (e.g. change sequence numbers for ordering undo/redo operations).
  //
  // PESSIMISTIC_WRITE locks the counter row for the duration of the
  // transaction (SELECT ... FOR UPDATE in PostgreSQL). Without this,
  // two concurrent requests under PostgreSQL's default READ COMMITTED
  // isolation could both read the same value before either commits,
  // producing duplicate sequence numbers. SQLite serializes writers
  // at the engine level so the lock is a no-op there.
  async getNextSequenceValue(sequenceName: string) {
    let counter = await this.em.findOne(
      CounterEntity,
      { _id: sequenceName },
      { lockMode: LockMode.PESSIMISTIC_WRITE },
    )
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
