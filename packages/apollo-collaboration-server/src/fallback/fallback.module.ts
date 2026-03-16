import { Module } from '@nestjs/common'

import { FallbackController } from './fallback.controller.js'

@Module({
  controllers: [FallbackController],
})
export class FallbackModule {}
