import fs from 'node:fs'
import { randomBytes } from 'node:crypto'

import {
  changeRegistry,
  checkRegistry,
  operationRegistry,
} from '@apollo-annotation/common'
import {
  CDSCheck,
  CoreValidation,
  TranscriptCheck,
  changes,
  operations,
  validationRegistry,
} from '@apollo-annotation/shared'
import type { LogLevel } from '@nestjs/common'
import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import { json, urlencoded } from 'express'
import session from 'express-session'

import { AppModule } from './app.module.js'
import { GlobalExceptionsFilter } from './global-exceptions.filter.js'
import { DatabaseService } from './mikro-orm/database.service.js'
import { AuthorizationValidation } from './utils/validation/AuthorizationValidation.js'

async function bootstrap() {
  const { CORS, LOG_LEVELS, PORT, SESSION_SECRET, SESSION_SECRET_FILE } =
    process.env
  if (!CORS) {
    throw new Error('No CORS found in .env file')
  }
  if (!LOG_LEVELS) {
    throw new Error('No LOG_LEVELS found in .env file')
  }
  if (!PORT) {
    throw new Error('No PORT found in .env file')
  }

  let sessionSecret = SESSION_SECRET
  if (!sessionSecret) {
    if (!SESSION_SECRET_FILE) {
      throw new Error(
        'No SESSION_SECRET or SESSION_SECRET_FILE found in .env file',
      )
    }
    sessionSecret = fs.readFileSync(SESSION_SECRET_FILE, 'utf8').trim()
  }

  for (const [changeName, change] of Object.entries(changes)) {
    changeRegistry.registerChange(changeName, change)
  }

  for (const [operationName, operation] of Object.entries(operations)) {
    operationRegistry.registerOperation(operationName, operation)
  }

  const cdsCheck = new CDSCheck()
  checkRegistry.registerCheck(cdsCheck.name, cdsCheck)

  const transcriptCheck = new TranscriptCheck()
  checkRegistry.registerCheck(transcriptCheck.name, transcriptCheck)

  validationRegistry.registerValidation(new CoreValidation())
  validationRegistry.registerValidation(new AuthorizationValidation())

  const cors = convertToBoolean(CORS)

  const logLevels = LOG_LEVELS.split(',') as LogLevel[]

  const app = await NestFactory.create(AppModule, { logger: logLevels, cors })

  const { httpAdapter } = app.get(HttpAdapterHost)
  app.useGlobalFilters(new GlobalExceptionsFilter(httpAdapter))

  app.use(json({ limit: '50mb' }))
  app.use(urlencoded({ extended: true, limit: '50mb' }))

  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
    }),
  )

  const server = await app.listen(PORT)
  server.headersTimeout = 24 * 60 * 60 * 1000
  server.requestTimeout = 24 * 60 * 60 * 1000

  // Seed checks into database
  const db = app.get(DatabaseService)
  const checksMap = checkRegistry.getChecks()
  for (const [key, check] of checksMap.entries()) {
    const existing = await db.checkConfig.findByName(key)
    if (existing) {
      if (existing.version !== check.version) {
        await db.checkConfig.upsert({ ...existing, version: check.version })
      }
    } else {
      const newId = randomBytes(12).toString('hex')
      await db.checkConfig.upsert({
        _id: newId,
        name: check.name,
        version: check.version,
        isDefault: true,
      })
    }
  }

  // eslint-disable-next-line no-console
  console.log(
    `Application is running on: ${await app.getUrl()}, CORS = ${cors}`,
  )
}
// eslint-disable-next-line unicorn/prefer-top-level-await
void bootstrap()

function convertToBoolean(input: string) {
  try {
    return JSON.parse(input)
  } catch {
    return undefined
  }
}
