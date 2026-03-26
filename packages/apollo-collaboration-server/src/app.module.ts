import type { ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ServeStaticModule } from '@nestjs/serve-static'
import Joi from 'joi'

import { AnalysisModule } from './analysis/analysis.module.js'
import { AssembliesModule } from './assemblies/assemblies.module.js'
import { AuthenticationModule } from './authentication/authentication.module.js'
import { ChecksModule } from './checks/checks.module.js'
import { ExportModule } from './export/export.module.js'
import { FallbackModule } from './fallback/fallback.module.js'
import { FeaturesModule } from './features/features.module.js'
import { FilesModule } from './files/files.module.js'
import { HealthModule } from './health/health.module.js'
import { JBrowseModule } from './jbrowse/jbrowse.module.js'
import { MessagesModule } from './messages/messages.module.js'
import { ApolloMikroOrmModule } from './mikro-orm/mikro-orm.module.js'
import { OrganismsModule } from './organisms/organisms.module.js'
import { PermissionsModule } from './permissions/permissions.module.js'
import { PluginsModule } from './plugins/plugins.module.js'
import { RefSeqsModule } from './refSeqs/refSeqs.module.js'
import { SequenceModule } from './sequence/sequence.module.js'
import { TracksModule } from './tracks/tracks.module.js'
import { UsersModule } from './users/users.module.js'
import { JwtAuthGuard } from './utils/jwt-auth.guard.js'
import { RolesGuard } from './utils/roles.guard.js'

const nodeEnv = process.env.NODE_ENV ?? 'production'

const validationSchema = Joi.object({
  // Required
  URL: Joi.string().uri().required(),
  NAME: Joi.string().required(),
  FILE_UPLOAD_FOLDER: Joi.string().required(),
  GOOGLE_CLIENT_ID: Joi.string(),
  GOOGLE_CLIENT_ID_FILE: Joi.string(),
  GOOGLE_CLIENT_SECRET: Joi.string(),
  GOOGLE_CLIENT_SECRET_FILE: Joi.string(),
  MICROSOFT_CLIENT_ID: Joi.string(),
  MICROSOFT_CLIENT_ID_FILE: Joi.string(),
  MICROSOFT_CLIENT_SECRET: Joi.string(),
  MICROSOFT_CLIENT_SECRET_FILE: Joi.string(),
  JWT_SECRET: Joi.string().min(32),
  JWT_SECRET_FILE: Joi.string(),
  SESSION_SECRET: Joi.string().min(32),
  SESSION_SECRET_FILE: Joi.string(),
  // Optional
  DESCRIPTION: Joi.string(),
  FEATURE_TYPE_ONTOLOGY_LOCATION: Joi.string(),
  PLUGIN_LOCATION: Joi.string(),
  INDEXED_IDS: Joi.string().default('gff_id'),
  ALLOW_ROOT_USER: Joi.boolean().default(false),
  ROOT_USER_PASSWORD: Joi.string(),
  ROOT_USER_PASSWORD_FILE: Joi.string(),

  PORT: Joi.number().default(3999),
  CORS: Joi.boolean().default(true),
  LOG_LEVELS: Joi.string()
    .custom((value) => {
      const errorMessage =
        'LOG_LEVELS must be a comma-separated list of log levels to output, where the possible values are: error, warn, log, debug, verbose'
      if (typeof value !== 'string') {
        throw new TypeError(errorMessage)
      }
      const levels = value.split(',')
      for (const level of levels) {
        if (!['log', 'error', 'warn', 'debug', 'verbose'].includes(level)) {
          throw new Error(errorMessage)
        }
      }
      return value
    })
    .default('log,warn,error'),
  CHUNK_SIZE: Joi.number(),
  DEFAULT_NEW_USER_ROLE: Joi.string()
    .valid('admin', 'user', 'readOnly', 'none')
    .default('readOnly'),
  ALLOW_GUEST_USER: Joi.boolean().default(false),
  GUEST_USER_ROLE: Joi.string()
    .valid('admin', 'user', 'readOnly')
    .default('readOnly'),
  PLUGIN_URLS: Joi.string()
    .custom((value) => {
      const errorMessage =
        'PLUGIN_URLS must be a comma-separated list of plugin URLs'
      if (typeof value !== 'string') {
        throw new TypeError(errorMessage)
      }
      const urls = value.split(',')
      for (const url of urls) {
        try {
          new URL(url)
        } catch {
          throw new Error(errorMessage)
        }
      }
      return value
    })
    .default(''),
  PLUGIN_URLS_FILE: Joi.string(),
  DB_BACKEND: Joi.string().valid('sqlite', 'postgresql', 'mongo'),
  DB_CONNECTION_URL: Joi.string(),
  OAUTH_HTTP_PROXY: Joi.string(),
  JBROWSE_STATIC_DIR: Joi.string(),
  APOLLO_TOOLS_CONFIG: Joi.string(),
})
  .oxor('GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_ID_FILE')
  .oxor('GOOGLE_CLIENT_SECRET', 'GOOGLE_CLIENT_SECRET_FILE')
  .oxor('MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_ID_FILE')
  .oxor('MICROSOFT_CLIENT_SECRET', 'MICROSOFT_CLIENT_SECRET_FILE')
  .oxor('ROOT_USER_PASSWORD', 'ROOT_USER_PASSWORD_FILE')
  .oxor('JWT_SECRET', 'JWT_SECRET_FILE')
  .oxor('SESSION_SECRET', 'SESSION_SECRET_FILE')
  .xor('PLUGIN_URLS', 'PLUGIN_URLS_FILE')

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: nodeEnv === 'production' ? '.env' : '.development.env',
      validationSchema,
    }),
    ServeStaticModule.forRoot({
      rootPath: path.join(
        path.dirname(fileURLToPath(import.meta.url)),
        'pages',
      ),
      serveRoot: '/',
      serveStaticOptions: {
        fallthrough: true,
        setHeaders(res: ServerResponse, filePath: string) {
          if (filePath.includes('/assets/')) {
            res.setHeader(
              'Cache-Control',
              'public, max-age=31536000, immutable',
            )
          } else {
            res.setHeader('Cache-Control', 'no-cache')
          }
        },
      },
    }),
    HealthModule,
    MessagesModule,
    ApolloMikroOrmModule.forRoot(),
    PluginsModule.registerAsync(),
    RefSeqsModule,
    UsersModule,
    FilesModule,
    ChecksModule,
    SequenceModule,
    FeaturesModule,
    AnalysisModule,
    AssembliesModule,
    OrganismsModule,
    JBrowseModule,
    ExportModule,
    TracksModule,
    PermissionsModule,
    AuthenticationModule,
    FallbackModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AppModule {}
