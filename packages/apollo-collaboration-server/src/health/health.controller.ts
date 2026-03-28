import { Controller, Get, Inject } from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'

import { Public } from '../authentication/roles.guard.js'

@Public()
@Controller('health')
export class HealthController {
  constructor(@Inject(HealthCheckService) private health: HealthCheckService) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([])
  }
}
