import { Module } from '@nestjs/common'

import { OrganismsController } from './organisms.controller.js'
import { OrganismsService } from './organisms.service.js'

@Module({
  controllers: [OrganismsController],
  providers: [OrganismsService],
  exports: [OrganismsService],
})
export class OrganismsModule {}
