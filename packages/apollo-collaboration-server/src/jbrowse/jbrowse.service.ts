import type { AssemblyRow } from '@apollo-annotation/common'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import merge from 'deepmerge'

import { AssembliesService } from '../assemblies/assemblies.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { RefSeqsService } from '../refSeqs/refSeqs.service.js'
import { Role } from '../utils/role/role.enum.js'

@Injectable()
export class JBrowseService {
  constructor(
    @Inject(AssembliesService)
    private readonly assembliesService: AssembliesService,
    @Inject(RefSeqsService) private readonly refSeqsService: RefSeqsService,
    @Inject(ConfigService)
    private readonly configService: ConfigService<
      {
        URL: string
        NAME: string
        DESCRIPTION?: string
        PLUGIN_LOCATION?: string
        FEATURE_TYPE_ONTOLOGY_LOCATION?: string
      },
      true
    >,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(JBrowseService.name)

  getConfiguration(role?: Role, userId?: string) {
    const url = this.configService.get('URL', { infer: true })
    const feature_type_ontology_location =
      this.configService.get('FEATURE_TYPE_ONTOLOGY_LOCATION', {
        infer: true,
      }) ?? 'sequence_ontology.json'
    const configuration = {
      theme: {
        palette: {
          primary: {
            main: '#0c4f4b',
          },
          secondary: {
            main: '#1AA39B',
          },
          tertiary: {
            main: '#4f0c10',
          },
          quaternary: {
            main: '#571AA3',
          },
          framesCDS: [
            null,
            { main: 'rgb(204,121,167)' },
            { main: 'rgb(230,159,0)' },
            { main: 'rgb(240,228,66)' },
            { main: 'rgb(86,180,233)' },
            { main: 'rgb(0,114,178)' },
            { main: 'rgb(0,158,115)' },
          ],
        },
      },
      ApolloPlugin: { hasRole: false, baseURL: url },
    }
    if (!role) {
      return configuration
    }
    if (role === Role.None) {
      return {
        ...configuration,
        ApolloPlugin: {
          hasRole: true,
          baseURL: url,
          role: 'none',
          userId,
        },
      }
    }
    return {
      ...configuration,
      ApolloPlugin: {
        hasRole: true,
        baseURL: url,
        role,
        userId,
        ontologies: [
          {
            name: 'Sequence Ontology',
            source: {
              uri: feature_type_ontology_location,
              locationType: 'UriLocation',
            },
          },
        ],
      },
    }
  }

  getPlugins() {
    const pluginLocation =
      this.configService.get('PLUGIN_LOCATION', { infer: true }) ?? 'apollo.js'
    return [
      {
        name: 'Apollo',
        url: pluginLocation,
      },
    ]
  }

  getDefaultSession() {
    return {
      name: 'Apollo',
      views: [{ type: 'LinearGenomeView' }],
    }
  }

  async getAssemblies() {
    const url = this.configService.get('URL', { infer: true })
    const assemblies = await this.assembliesService.findAll()
    return assemblies.map((assembly: AssemblyRow) => {
      const assemblyId = String(assembly._id)
      const trackId = `sequenceConfigId-${assembly.name}`
      return {
        name: assemblyId,
        aliases:
          assembly.aliases && assembly.aliases.length > 0
            ? [...assembly.aliases]
            : [assembly.name],
        displayName: assembly.displayName || assembly.name,
        sequence: {
          trackId,
          type: 'ReferenceSequenceTrack',
          adapter: {
            type: 'ApolloSequenceAdapter',
            assemblyId,
            baseURL: {
              uri: url,
              locationType: 'UriLocation',
            },
          },
          displays: [
            {
              type: 'LinearApolloReferenceSequenceDisplay',
              displayId: `${trackId}-LinearApolloReferenceSequenceDisplay`,
            },
          ],
          metadata: {
            apollo: true,
          },
        },
        refNameAliases: {
          adapter: {
            type: 'ApolloRefNameAliasAdapter',
            assemblyId,
            baseURL: { uri: url, locationType: 'UriLocation' },
          },
        },
      }
    })
  }

  async getTracks() {
    const url = this.configService.get('URL', { infer: true })
    const assemblies = await this.assembliesService.findAll()
    return assemblies.map((assembly: AssemblyRow) => {
      const trackId = `apollo_track_${assembly._id}`
      return {
        type: 'ApolloTrack',
        trackId,
        name: `Annotations (${assembly.displayName || assembly.name})`,
        assemblyNames: [assembly._id],
        textSearching: {
          textSearchAdapter: {
            type: 'ApolloTextSearchAdapter',
            trackId,
            assemblyNames: [assembly._id],
            textSearchAdapterId: `apollo_search_${assembly._id}`,
            baseURL: {
              uri: url,
              locationType: 'UriLocation',
            },
          },
        },
      }
    })
  }

  async getAggregateTextSearchAdapters() {
    const url = this.configService.get('URL', { infer: true })
    const assemblies = await this.assembliesService.findAll()
    return assemblies.map((assembly: AssemblyRow) => ({
      type: 'ApolloTextSearchAdapter',
      textSearchAdapterId: `apollo_search_${assembly._id}`,
      trackId: `apollo_track_${assembly._id}`,
      assemblyNames: [assembly._id],
      baseURL: {
        uri: url,
        locationType: 'UriLocation',
      },
    }))
  }

  async getJBrowseConfig() {
    const row = await this.db.jbrowseConfig.findOne()
    return row?.config
  }

  async getConfig(role?: Role, userId?: string) {
    if (!role || role === Role.None) {
      return {
        configuration: this.getConfiguration(role, userId),
        plugins: this.getPlugins(),
      }
    }
    const storedConfig = await this.getJBrowseConfig()
    const generatedConfig = {
      configuration: this.getConfiguration(role, userId),
      assemblies: await this.getAssemblies(),
      tracks: await this.getTracks(),
      aggregateTextSearchAdapters: await this.getAggregateTextSearchAdapters(),
      plugins: this.getPlugins(),
      defaultSession: this.getDefaultSession(),
    }
    if (!storedConfig) {
      return generatedConfig
    }
    return merge(generatedConfig, storedConfig)
  }
}
