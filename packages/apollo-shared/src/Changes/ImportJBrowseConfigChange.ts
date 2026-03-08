/* eslint-disable @typescript-eslint/require-await */
import {
  Change,
  type ChangeOptions,
  type ClientDataStore,
  type ServerDataStore,
} from '@apollo-annotation/common'
import ObjectID from 'bson-objectid'

interface JBrowseAssembly {
  sequence: { adapter: { type: string } }
}

interface JBrowseTrack {
  type: string
  trackId: string
}

interface JBrowsePlugin {
  name: string
}

interface JBrowseInternetAccount {
  type: string
}

export interface JBrowseConfig {
  assemblies?: JBrowseAssembly[]
  configuration?: {
    ApolloPlugin?: Record<string, unknown>
  }
  tracks?: JBrowseTrack[]
  plugins?: JBrowsePlugin[]
  internetAccounts?: JBrowseInternetAccount[]
  [key: string]: unknown
}

export interface SerializedImportJBrowseConfigChange {
  typeName: 'ImportJBrowseConfigChange'
  oldJBrowseConfig?: JBrowseConfig
  newJBrowseConfig?: JBrowseConfig
}

export function filterJBrowseConfig(config: JBrowseConfig): JBrowseConfig {
  const {
    __v,
    _id,
    assemblies,
    configuration,
    internetAccounts,
    plugins,
    tracks,
    ...rest
  } = config
  // Need to make sure that configuration.ApolloPlugin.hasRole isn't set
  const filteredConfig = rest as JBrowseConfig
  if (assemblies) {
    filteredConfig.assemblies = assemblies.filter(
      (a) => a.sequence.adapter.type !== 'ApolloSequenceAdapter',
    )
  }
  if (configuration?.ApolloPlugin?.hasRole) {
    const { hasRole, ...apolloPluginRest } = configuration.ApolloPlugin
    filteredConfig.configuration = {
      ...configuration,
      ApolloPlugin: apolloPluginRest,
    }
  }
  if (internetAccounts) {
    filteredConfig.internetAccounts = internetAccounts.filter(
      (i) => i.type !== 'ApolloInternetAccount',
    )
  }
  if (plugins) {
    filteredConfig.plugins = plugins.filter((p) => p.name !== 'Apollo')
  }
  if (tracks) {
    filteredConfig.tracks = tracks.filter((t) => t.type !== 'ApolloTrack')
  }
  return filteredConfig
}

export class ImportJBrowseConfigChange extends Change {
  typeName = 'ImportJBrowseConfigChange' as const
  oldJBrowseConfig?: JBrowseConfig
  newJBrowseConfig?: JBrowseConfig

  constructor(
    json: SerializedImportJBrowseConfigChange,
    options?: ChangeOptions,
  ) {
    super(json, options)
    this.oldJBrowseConfig = json.oldJBrowseConfig
    this.newJBrowseConfig = json.newJBrowseConfig
  }

  toJSON(): SerializedImportJBrowseConfigChange {
    const { newJBrowseConfig, oldJBrowseConfig, typeName } = this
    return { typeName, oldJBrowseConfig, newJBrowseConfig }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { logger, newJBrowseConfig } = this
    await backend.jbrowseConfigRepository.deleteAll()
    if (newJBrowseConfig) {
      const filtered = filterJBrowseConfig(newJBrowseConfig)
      await backend.jbrowseConfigRepository.upsert({
        _id: new ObjectID().toHexString(),
        config: filtered as Record<string, unknown>,
      })
    }
    logger.debug?.('Stored new JBrowse Config')
  }
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  async executeOnClient(_dataStore: ClientDataStore) {}

  getInverse() {
    const { logger, newJBrowseConfig, oldJBrowseConfig } = this
    return new ImportJBrowseConfigChange(
      {
        typeName: 'ImportJBrowseConfigChange',
        oldJBrowseConfig: newJBrowseConfig,
        newJBrowseConfig: oldJBrowseConfig,
      },
      { logger },
    )
  }
}
