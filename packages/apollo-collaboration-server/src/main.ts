import { randomBytes } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

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
import { MikroORM, RequestContext } from '@mikro-orm/core'
import type { LogLevel } from '@nestjs/common'
import { HttpAdapterHost, NestFactory } from '@nestjs/core'
import cookieParser from 'cookie-parser'
import express, { type Request, type Response, json, urlencoded } from 'express'
import session from 'express-session'

import { AppModule } from './app.module.js'
import { GlobalExceptionsFilter } from './global-exceptions.filter.js'
import { DatabaseService } from './mikro-orm/database.service.js'

async function bootstrap() {
  const {
    CORS,
    JBROWSE_STATIC_DIR,
    LOG_LEVELS,
    PORT,
    SESSION_SECRET,
    SESSION_SECRET_FILE,
  } = process.env
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

  const cors = convertToBoolean(CORS)

  const logLevels = LOG_LEVELS.split(',') as LogLevel[]

  const app = await NestFactory.create(AppModule, { logger: logLevels, cors })

  const { httpAdapter } = app.get(HttpAdapterHost)
  app.useGlobalFilters(new GlobalExceptionsFilter(httpAdapter))

  app.use(cookieParser())

  // RequestContext middleware gives each HTTP request its own EntityManager
  // fork (via AsyncLocalStorage). This means all database operations within a
  // request share one identity map and don't interfere with other requests.
  const orm = app.get(MikroORM)
  app.use((_req: unknown, _res: unknown, next: () => void) => {
    RequestContext.create(orm.em, next)
  })

  app.use(json({ limit: '50mb' }))
  app.use(urlencoded({ extended: true, limit: '50mb' }))

  const isProduction = process.env.NODE_ENV === 'production'
  app.use(
    session({
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: isProduction,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000,
      },
    }),
  )

  // Serve JBrowse static files from JBROWSE_STATIC_DIR (if configured)
  // under /jbrowse/. config.json is excluded — served dynamically by
  // JBrowseController.
  if (JBROWSE_STATIC_DIR) {
    const staticDir = path.resolve(JBROWSE_STATIC_DIR)
    // eslint-disable-next-line no-console
    console.log(`Serving JBrowse static files from: ${staticDir}`)
    const staticMiddleware = express.static(staticDir)
    app.use('/jbrowse', (req: Request, res: Response, next: () => void) => {
      if (req.path === '/config.json') {
        next()
        return
      }
      staticMiddleware(req, res, next)
    })
  }

  const server = await app.listen(PORT, '0.0.0.0')
  server.headersTimeout = 24 * 60 * 60 * 1000
  server.requestTimeout = 24 * 60 * 60 * 1000

  // Seed checks into database. This runs outside of an HTTP request, so we
  // need an explicit RequestContext to get an isolated EntityManager.
  await RequestContext.create(orm.em, async () => {
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
  })

  // Generate setup token if no admin exists
  await RequestContext.create(orm.em, async () => {
    const { AuthenticationService } =
      await import('./authentication/authentication.service.js')
    const authService = app.get(AuthenticationService)
    const setupToken = await authService.generateSetupTokenIfNeeded()
    if (setupToken) {
      const appUrl = await app.getUrl()
      // eslint-disable-next-line no-console
      console.log(`Setup URL: ${appUrl}/auth/setup?token=${setupToken}`)
    }
  })

  // eslint-disable-next-line no-console
  console.log(
    `Application is running on: ${await app.getUrl()}, CORS = ${cors}`,
  )

  app.enableShutdownHooks()
}
// eslint-disable-next-line unicorn/prefer-top-level-await
void bootstrap()

function convertToBoolean(input: string) {
  try {
    return JSON.parse(input)
  } catch {
    return
  }
}
