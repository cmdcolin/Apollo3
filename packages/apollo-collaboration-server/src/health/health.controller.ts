import { Controller, Get, Inject } from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'

import { Public } from '../utils/roles.guard.js'

@Controller('health')
export class HealthController {
  constructor(@Inject(HealthCheckService) private health: HealthCheckService) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([])
  }
}
