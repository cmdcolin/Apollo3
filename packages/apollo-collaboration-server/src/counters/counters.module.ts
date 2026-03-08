import { Module } from '@nestjs/common'

import { CountersService } from './counters.service.js'

@Module({
  providers: [CountersService],
  exports: [CountersService],
})
export class CountersModule {}
