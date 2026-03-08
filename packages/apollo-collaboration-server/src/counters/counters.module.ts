import { Counter, CounterSchema } from '@apollo-annotation/schemas'
import { Module } from '@nestjs/common'
import { MongooseModule } from '@nestjs/mongoose'

import { useMongoose } from '../utils/constants'

import { CountersService } from './counters.service'

@Module({
  // controllers: [CountersController],
  providers: [CountersService],
  imports: [
    ...(useMongoose
      ? [
          MongooseModule.forFeature([
            { name: Counter.name, schema: CounterSchema },
          ]),
        ]
      : []),
  ],
  exports: [...(useMongoose ? [MongooseModule] : []), CountersService],
})
export class CountersModule {}
