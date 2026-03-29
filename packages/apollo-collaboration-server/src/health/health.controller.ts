import { randomBytes } from 'node:crypto'

import { checkRegistry } from '@apollo-annotation/common'
import { FeatureHistorySubscriber } from '@apollo-annotation/entities'
import { MikroORM, RequestContext } from '@mikro-orm/core'
import {
  Controller,
  ForbiddenException,
  Get,
  Inject,
  Logger,
  Post,
} from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'

import { Public } from '../authentication/roles.guard.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)

  constructor(
    @Inject(HealthCheckService) private health: HealthCheckService,
    @Inject(MikroORM) private readonly orm: MikroORM,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([])
  }

  @Post('test-reset-db')
  async testResetDb() {
    if (!process.env.ALLOW_TEST_RESET) {
      throw new ForbiddenException('ALLOW_TEST_RESET is not enabled')
    }
    this.logger.log('Resetting database for test...')

    await this.orm.schema.drop()
    await this.orm.schema.create()
    this.orm.em.clear()

    this.orm.em
      .getEventManager()
      .registerSubscriber(new FeatureHistorySubscriber())

    await RequestContext.create(this.orm.em, async () => {
      const checksMap = checkRegistry.getChecks()
      for (const [key, checkDef] of checksMap.entries()) {
        const newId = randomBytes(12).toString('hex')
        await this.db.checkConfig.upsert({
          _id: newId,
          name: checkDef.name,
          version: checkDef.version,
          isDefault: true,
        })
      }
    })

    this.logger.log('Database reset complete')
    return { ok: true }
  }
}
