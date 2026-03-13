import { defineEntity, p } from '@mikro-orm/core'

export const CounterEntity = defineEntity({
  name: 'CounterEntity',
  tableName: 'counter',
  properties: {
    _id: p.string().primary(),
    sequenceValue: p.integer().default(0),
  },
})
