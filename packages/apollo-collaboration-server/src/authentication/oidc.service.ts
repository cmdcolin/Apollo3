import fs from 'node:fs'

import { Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import {
  type Configuration,
  authorizationCodeGrant,
  buildAuthorizationUrl,
  discovery,
  fetchUserInfo,
} from 'openid-client'

export interface OidcProvider {
  name: string
  displayName: string
  config: Configuration
  scope: string
}

interface OidcConfigValues {
  URL: string
  OIDC_PROVIDERS?: string
  OIDC_PROVIDERS_FILE?: string
}

interface ProviderJson {
  name: string
  displayName?: string
  issuerUrl: string
  clientId: string
  clientSecret: string
  scope?: string
}

@Injectable()
export class OidcService implements OnModuleInit {
  private readonly logger = new Logger(OidcService.name)
  private providers = new Map<string, OidcProvider>()

  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<OidcConfigValues, true>,
  ) {}

  async onModuleInit() {
    const providerConfigs = this.loadProviderConfigs()
    for (const p of providerConfigs) {
      try {
        const config = await discovery(
          new URL(p.issuerUrl),
          p.clientId,
          p.clientSecret,
        )
        this.providers.set(p.name, {
          name: p.name,
          displayName: p.displayName ?? p.name,
          config,
          scope: p.scope ?? 'openid email profile',
        })
        this.logger.log(`OIDC provider "${p.name}" configured (${p.issuerUrl})`)
      } catch (error) {
        this.logger.error(
          `Failed to configure OIDC provider "${p.name}": ${String(error)}`,
        )
      }
    }
  }

  private loadProviderConfigs(): ProviderJson[] {
    let raw = this.configService.get('OIDC_PROVIDERS', { infer: true })
    if (!raw) {
      const filePath = this.configService.get('OIDC_PROVIDERS_FILE', {
        infer: true,
      })
      if (filePath) {
        raw = fs.readFileSync(filePath, 'utf8').trim()
      }
    }
    if (!raw) {
      return []
    }
    try {
      return JSON.parse(raw) as ProviderJson[]
    } catch (error) {
      this.logger.error(
        `Failed to parse OIDC_PROVIDERS JSON — check syntax: ${String(error)}`,
      )
      return []
    }
  }

  getProvider(name: string) {
    return this.providers.get(name)
  }

  getProviderNames() {
    return [...this.providers.values()].map((p) => ({
      name: p.name,
      displayName: p.displayName,
    }))
  }

  buildAuthorizationUrl(
    provider: OidcProvider,
    callbackUrl: string,
    state: string,
  ) {
    const params = new URLSearchParams()
    params.set('redirect_uri', callbackUrl)
    params.set('scope', provider.scope)
    params.set('state', state)
    return buildAuthorizationUrl(provider.config, params)
  }

  async handleCallback(
    provider: OidcProvider,
    callbackUrl: URL,
    expectedState: string,
  ) {
    const tokens = await authorizationCodeGrant(
      provider.config,
      callbackUrl,
      { expectedState },
    )
    const claims = tokens.claims()
    if (claims?.email) {
      return {
        email: claims.email as string,
        name: (claims.name as string | undefined) ?? 'N/A',
      }
    }
    const userInfo = await fetchUserInfo(
      provider.config,
      tokens.access_token,
      claims?.sub,
    )
    if (!userInfo.email) {
      throw new Error(
        `OIDC provider "${provider.name}" did not return an email`,
      )
    }
    return {
      email: userInfo.email as string,
      name: (userInfo.name as string | undefined) ?? 'N/A',
    }
  }
}
