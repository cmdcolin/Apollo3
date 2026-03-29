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
  ServiceUnavailableException,
} from '@nestjs/common'
import { HealthCheck, HealthCheckService } from '@nestjs/terminus'

import { Public } from '../authentication/roles.guard.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

@Public()
@Controller('health')
export class HealthController {
  private readonly logger = new Logger(HealthController.name)
  private resetting = false

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
    if (this.resetting) {
      throw new ServiceUnavailableException('Database reset already in progress')
    }
    this.resetting = true
    try {
      this.logger.log('Resetting database for test...')

      this.orm.em.clear()

      const eventManager = this.orm.em.getEventManager()
      const subscribers = eventManager.getSubscribers()
      for (const subscriber of subscribers) {
        if (subscriber instanceof FeatureHistorySubscriber) {
          subscribers.delete(subscriber)
        }
      }

      // Use clearDatabase() instead of drop()+create() to avoid DDL exclusive
      // lock conflicts with in-flight requests on in-memory SQLite
      const conn = this.orm.em.getConnection()
      await conn.execute('PRAGMA foreign_keys = OFF')
      await this.orm.schema.clear()
      await conn.execute('PRAGMA foreign_keys = ON')

      eventManager.registerSubscriber(new FeatureHistorySubscriber())

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
    } finally {
      this.resetting = false
    }
  }
}
