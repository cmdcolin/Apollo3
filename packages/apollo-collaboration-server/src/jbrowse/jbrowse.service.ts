import type { AssemblyRow } from '@apollo-annotation/common'
import type { DecodedJWT } from '@apollo-annotation/shared'
import { Inject, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

import { AnalysisService } from '../analysis/analysis.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'
import { PermissionService } from '../permissions/permission.service.js'
import { Role } from '../utils/role/role.enum.js'

@Injectable()
export class JBrowseService {
  constructor(
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
    @Inject(PermissionService)
    private readonly permissionService: PermissionService,
    @Inject(AnalysisService)
    private readonly analysisService: AnalysisService,
  ) {}

  async getConfiguration(user: DecodedJWT | undefined) {
    const role = user?.role
    const userId = user?.id
    const userSessionId =
      userId && user.iat ? `${userId}-${user.iat}` : undefined
    const url = this.configService.get('URL', { infer: true })
    const feature_type_ontology_location =
      this.configService.get('FEATURE_TYPE_ONTOLOGY_LOCATION', {
        infer: true,
      }) ?? 'sequence_ontology.json'
    const configuration = {
      logoPath: {
        uri: new URL('apollo_logo.svg', url).href,
        locationType: 'UriLocation',
      },
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
          userSessionId,
        },
      }
    }
    const readOnly = role === Role.ReadOnly
    const tools = readOnly ? [] : await this.analysisService.getTools()
    const availableAnalysisTools = tools
      .filter((t) => t.installed)
      .map((t) => t.tool)
    return {
      ...configuration,
      ApolloPlugin: {
        hasRole: true,
        baseURL: url,
        role,
        readOnly,
        availableAnalysisTools,
        userId,
        userSessionId,
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

  getAssemblyConfig(assembly: AssemblyRow) {
    const url = this.configService.get('URL', { infer: true })
    const assemblyId = assembly._id
    const trackId = `sequenceConfigId-${assembly.name}`
    return {
      name: assemblyId,
      aliases:
        assembly.aliases && assembly.aliases.length > 0
          ? [...assembly.aliases]
          : [assembly.name],
      displayName: assembly.displayName ?? assembly.name,
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
  }

  getApolloTrackConfig(assembly: AssemblyRow) {
    const url = this.configService.get('URL', { infer: true })
    const trackId = `apollo_track_${assembly._id}`
    return {
      type: 'ApolloTrack',
      trackId,
      name: `Annotations (${assembly.displayName ?? assembly.name})`,
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
  }

  getApolloTextSearchAdapter(assembly: AssemblyRow) {
    const url = this.configService.get('URL', { infer: true })
    return {
      type: 'ApolloTextSearchAdapter',
      textSearchAdapterId: `apollo_search_${assembly._id}`,
      trackId: `apollo_track_${assembly._id}`,
      assemblyNames: [assembly._id],
      baseURL: {
        uri: url,
        locationType: 'UriLocation',
      },
    }
  }

  async getAccessibleAssemblies(
    user: DecodedJWT | undefined,
    requestedAssemblyIds: string[] | undefined,
  ) {
    if (requestedAssemblyIds) {
      const filteredIds = await this.permissionService.filterAccessibleIds(
        user,
        requestedAssemblyIds,
      )
      return this.db.assembly.findByIds(filteredIds)
    }
    const accessibleIds =
      await this.permissionService.getAccessibleAssemblyIds(user)
    return this.db.assembly.findByIds(accessibleIds)
  }

  async getConfig(user: DecodedJWT | undefined, assemblyIds?: string[]) {
    const configuration = await this.getConfiguration(user)
    const plugins = this.getPlugins()
    const assemblies = await this.getAccessibleAssemblies(user, assemblyIds)

    if (assemblies.length === 0) {
      return { configuration, plugins }
    }
    return this.buildFullConfig(configuration, plugins, assemblies)
  }

  private async buildFullConfig(
    configuration: ReturnType<typeof this.getConfiguration>,
    plugins: ReturnType<typeof this.getPlugins>,
    assemblies: AssemblyRow[],
  ) {
    const assemblyIds = assemblies.map((a) => a._id)

    const assemblyConfigs = assemblies.map((a) => this.getAssemblyConfig(a))
    const apolloTracks = assemblies.map((a) => this.getApolloTrackConfig(a))
    const apolloSearchAdapters = assemblies.map((a) =>
      this.getApolloTextSearchAdapter(a),
    )

    const storedTracks =
      await this.db.trackConfig.findByAssemblyIds(assemblyIds)
    const storedTrackConfigs = storedTracks.map((t) => t.config)

    const storedTextSearchAdapters =
      await this.db.textSearchAdapterConfig.findByAssemblyIds(assemblyIds)
    const storedAdapterConfigs = storedTextSearchAdapters.map((a) => a.config)

    return {
      configuration,
      assemblies: assemblyConfigs,
      tracks: [...apolloTracks, ...storedTrackConfigs],
      aggregateTextSearchAdapters: [
        ...apolloSearchAdapters,
        ...storedAdapterConfigs,
      ],
      plugins,
      defaultSession: this.getDefaultSession(),
    }
  }
}
