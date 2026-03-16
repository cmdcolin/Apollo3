import fs from 'node:fs/promises'

import { Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { JwtModule, type JwtModuleOptions } from '@nestjs/jwt'

import { PermissionsModule } from '../permissions/permissions.module.js'

import { MessagesGateway } from './messages.gateway.js'

interface JWTSecretConfig {
  JWT_SECRET?: string
  JWT_SECRET_FILE?: string
}

async function jwtConfigFactory(
  configService: ConfigService<JWTSecretConfig, true>,
): Promise<JwtModuleOptions> {
  let jwtSecret = configService.get('JWT_SECRET', { infer: true })
  if (!jwtSecret) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const jwtFile = configService.get('JWT_SECRET_FILE', { infer: true })!
    const jwtFileText = await fs.readFile(jwtFile, 'utf8')
    jwtSecret = jwtFileText.trim()
  }
  return { secret: jwtSecret, signOptions: { expiresIn: '1d' } }
}

@Module({
  imports: [
    PermissionsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: jwtConfigFactory,
      inject: [ConfigService],
    }),
  ],
  providers: [MessagesGateway],
  exports: [MessagesGateway],
})
export class MessagesModule {}
