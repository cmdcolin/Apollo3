/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { ClientDataStore as ClientDataStoreType } from '@apollo-annotation/common'
import {
  type AnnotationFeature,
  AnnotationFeatureModel,
} from '@apollo-annotation/mst'
import {
  COMMON_CHANNEL,
  type FeatureUpdateMessage,
} from '@apollo-annotation/shared'
import type PluginManager from '@jbrowse/core/PluginManager'
import type { AssemblyModel } from '@jbrowse/core/assemblyManager/assembly'
import { getConf, readConfObject } from '@jbrowse/core/configuration'
import type { BaseTrackConfig } from '@jbrowse/core/pluggableElementTypes'
import type {
  AbstractSessionModel,
  SessionWithAddTracks,
} from '@jbrowse/core/util'
import {
  type Instance,
  type SnapshotOut,
  addDisposer,
  applySnapshot,
  getRoot,
  getSnapshot,
  types,
} from '@jbrowse/mobx-state-tree'
import DownloadIcon from '@mui/icons-material/Download'
import EditIcon from '@mui/icons-material/Edit'
import FactCheckIcon from '@mui/icons-material/FactCheck'
import FileOpenIcon from '@mui/icons-material/FileOpen'
import LockIcon from '@mui/icons-material/Lock'
import LogoutIcon from '@mui/icons-material/Logout'
import RedoIcon from '@mui/icons-material/Redo'
import SaveIcon from '@mui/icons-material/Save'
import TrackChangesIcon from '@mui/icons-material/TrackChanges'
import UndoIcon from '@mui/icons-material/Undo'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { autorun } from 'mobx'
import { type Socket, io } from 'socket.io-client'

import { ApolloJobModel } from '../ApolloJobModel'
import type { FeatureService } from '../FeatureService'
import {
  DownloadGFF3,
  LogOut,
  OpenLocalFile,
  ViewChangeLog,
  ViewCheckResults,
} from '../components'
import { LoginDialog } from '../components/LoginDialog'
import type ApolloPluginConfigurationSchema from '../config'
import type { ApolloRootModel } from '../types'
import {
  createFetchErrorMessage,
  getBaseURL,
  getRole,
  isReadOnly,
} from '../util'

import { clientDataStoreFactory } from './ClientDataStore'

export interface ApolloSession extends AbstractSessionModel {
  apolloDataStore: ClientDataStoreType & {
    featureService: FeatureService
  }
  apolloSelectedFeature?: AnnotationFeature
  apolloSetSelectedFeature(feature?: AnnotationFeature): void
  menus(): { label: string; menuItems: unknown[] }[]
}

export interface HoveredFeature {
  feature: AnnotationFeature
  bp: number
}

const inWebWorker = typeof sessionStorage === 'undefined'

export function extendSession(
  pluginManager: PluginManager,
  sessionModel: ReturnType<typeof types.model>,
) {
  const AnnotationFeatureExtended = pluginManager.evaluateExtensionPoint(
    'Apollo-extendAnnotationFeature',
    AnnotationFeatureModel,
  ) as typeof AnnotationFeatureModel
  const ClientDataStore = clientDataStoreFactory(AnnotationFeatureExtended)
  const sm = sessionModel
    .props({
      apolloDataStore: types.optional(ClientDataStore, { typeName: 'Client' }),
      apolloSelectedFeature: types.safeReference(AnnotationFeatureExtended),
      jobsManager: types.optional(ApolloJobModel, {}),
      isLocked: types.optional(types.boolean, false),
    })
    .volatile(() => ({
      apolloHoveredFeature: undefined as HoveredFeature | undefined,
      abortController: new AbortController(),
      changeInProgress: false,
      apolloSocket: undefined as Socket | undefined,
      apolloUserSessionId: undefined as string | undefined,
      lastChangeSequenceNumber: undefined as number | undefined,
    }))
    .actions((self) => ({
      apolloSetSelectedFeature(feature?: AnnotationFeature | string) {
        // @ts-expect-error Not sure why TS thinks these MST types don't match
        self.apolloSelectedFeature = feature
      },
      apolloSetHoveredFeature(feature?: HoveredFeature) {
        self.apolloHoveredFeature = feature
      },
      addApolloTrackConfig(assembly: AssemblyModel, baseURL?: string) {
        const trackId = `apollo_track_${assembly.name}`
        const hasTrack = (self as unknown as AbstractSessionModel).tracks.some(
          (track) => track.trackId === trackId,
        )
        if (!hasTrack) {
          ;(self as unknown as SessionWithAddTracks).addTrackConf({
            type: 'ApolloTrack',
            trackId,
            name: `Annotations (${
              // @ts-expect-error getConf types don't quite work here for some reason
              getConf(assembly, 'displayName') ?? assembly.name
            })`,
            assemblyNames: [assembly.name],
            textSearching: {
              textSearchAdapter: {
                type: 'ApolloTextSearchAdapter',
                trackId,
                assemblyNames: [assembly.name],
                textSearchAdapterId: `apollo_search_${assembly.name}`,
                ...(baseURL
                  ? { baseURL: { uri: baseURL, locationType: 'UriLocation' } }
                  : {}),
              },
            },
          })
        }
      },
      toggleLocked() {
        self.isLocked = !self.isLocked
      },
      setChangeInProgress(changeInProgress: boolean) {
        self.changeInProgress = changeInProgress
      },
      getPluginConfiguration() {
        const { jbrowse } = getRoot<ApolloRootModel>(self)
        const pluginConfiguration =
          // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
          jbrowse.configuration.ApolloPlugin as Instance<
            typeof ApolloPluginConfigurationSchema
          >
        return pluginConfiguration
      },
      setLastChangeSequenceNumber(sequenceNumber: number) {
        self.lastChangeSequenceNumber = sequenceNumber
      },
      setUserSessionId(id: string) {
        self.apolloUserSessionId = id
      },
    }))
    .actions((self) => ({
      async updateLastChangeSequenceNumber() {
        const baseURL = getBaseURL(self as unknown as ApolloSessionModel)
        if (!baseURL) {
          return
        }
        const url = new URL('changes', baseURL)
        const searchParams = new URLSearchParams({ limit: '1' })
        url.search = searchParams.toString()
        const uri = url.toString()

        const response = await fetch(uri, {
          method: 'GET',
          signal: self.abortController.signal,
        })
        if (!response.ok) {
          const errorMessage = await createFetchErrorMessage(
            response,
            'Error when fetching server LastChangeSequence',
          )
          throw new Error(errorMessage)
        }
        const changes = await response.json()
        const sequence =
          (changes as { sequence: number }[]).length > 0
            ? (changes as { sequence: number }[])[0].sequence
            : 0
        self.setLastChangeSequenceNumber(sequence)
      },
    }))
    .actions((self) => ({
      addSocketListeners() {
        const apolloSession = self as unknown as ApolloSessionModel
        const baseURL = getBaseURL(apolloSession)
        if (!baseURL) {
          return
        }
        const { origin, pathname: path } = new URL('socket.io/', baseURL)
        const socket = io(origin, { path, withCredentials: true })
        self.apolloSocket = socket
        const { apolloUserSessionId } = self
        if (!apolloUserSessionId) {
          throw new Error('No userSessionId — cannot set up WebSocket')
        }
        const localSessionId = apolloUserSessionId
        const { apolloDataStore } = self
        const { notify } = self as unknown as AbstractSessionModel
        socket.on('connect', () => {
          void apolloDataStore.refreshLoadedRegions()
        })
        socket.on('connect_error', (error) => {
          console.error(error)
          notify('Could not connect to the Apollo server.', 'error')
        })
        socket.on(
          COMMON_CHANNEL,
          (message: FeatureUpdateMessage) => {
            self.setLastChangeSequenceNumber(message.changeSequence)
            if (message.userSessionId === localSessionId) {
              return
            }
            try {
              apolloDataStore.applyFeatureUpdate(
                message.assemblyId,
                message.features,
                message.deletedFeatureIds,
              )
            } catch (error) {
              console.error('Failed to apply incoming change:', error)
            }
          },
        )
      },
    }))
    .actions((self) => ({
      async initializeApolloConnection() {
        const apolloSession = self as unknown as ApolloSessionModel
        const role = getRole(apolloSession)
        if (!role || role === 'none') {
          if (role === 'none') {
            ;(self as unknown as AbstractSessionModel).notify(
              'You have registered as an Apollo user but have not been given access. Ask your administrator to enable access for your account.',
              'warning',
            )
          }
          return
        }
        await self.updateLastChangeSequenceNumber()
        self.addSocketListeners()
      },
    }))
    .volatile((self) => ({
      previousSnapshot: getSnapshot(self),
    }))
    .actions((self) => ({
      afterCreate() {
        applySnapshot(self, { name: self.name, id: self.id })
        // @ts-expect-error type is missing on ApolloRootModel
        const { jbrowse, reloadPluginManagerCallback } =
          getRoot<ApolloRootModel>(self)
        addDisposer(
          self,
          autorun(
            async (reaction) => {
              if (inWebWorker) {
                return
              }
              const pluginConfiguration =
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                jbrowse.configuration.ApolloPlugin as Instance<
                  typeof ApolloPluginConfigurationSchema
                >
              const hasRole = readConfObject(
                pluginConfiguration,
                'hasRole',
              ) as boolean
              if (hasRole) {
                // @ts-expect-error not sure why snapshot type is wrong for snapshot
                applySnapshot(self, self.previousSnapshot)
                // Initialize WebSocket after config is loaded
                try {
                  await self.initializeApolloConnection()
                } catch {
                  // initialization may fail if server is unavailable
                }
                reaction.dispose()
                return
              }

              const { signal } = self.abortController
              const baseURL = readConfObject(
                pluginConfiguration,
                'baseURL',
              ) as string
              if (!baseURL) {
                return
              }

              const uri = new URL('jbrowse/config.json', baseURL).href
              let response: Response
              try {
                response = await fetch(uri, { signal })
              } catch (error) {
                if (!self.abortController.signal.aborted) {
                  console.error(error)
                }
                return
              }
              if (!response.ok) {
                const errorMessage = await createFetchErrorMessage(
                  response,
                  'Failed to fetch assemblies',
                )
                console.error(errorMessage)
                return
              }
              let jbrowseConfig
              try {
                jbrowseConfig = await response.json()
              } catch (error) {
                console.error(error)
                return
              }

              // Check if the server config includes a role (user is authenticated)
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              const serverHasRole = jbrowseConfig?.configuration?.ApolloPlugin
                ?.hasRole as boolean | undefined
              if (!serverHasRole) {
                // User is not authenticated — show login dialog
                ;(self as unknown as AbstractSessionModel).queueDialog(
                  (doneCallback) => [
                    LoginDialog,
                    {
                      session: self as unknown as ApolloSessionModel,
                      handleClose: () => {
                        doneCallback()
                      },
                    },
                  ],
                )
                reaction.dispose()
                return
              }

              // Extract userSessionId before reloading config
              // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
              const userSessionId = jbrowseConfig?.configuration?.ApolloPlugin
                ?.userSessionId as string | undefined
              if (userSessionId) {
                self.setUserSessionId(userSessionId)
              }

              // eslint-disable-next-line @typescript-eslint/no-unsafe-call
              reloadPluginManagerCallback(jbrowseConfig, self.previousSnapshot)
              reaction.dispose()
            },
            { name: 'ApolloSessionLoadConfig' },
          ),
        )
      },
      beforeDestroy() {
        self.abortController.abort(
          new DOMException('Clean up Apollo session', 'AbortError'),
        )
        if (self.apolloSocket) {
          self.apolloSocket.close()
        }
      },
    }))

    .views((self) => {
      const superMenus = (self as unknown as ApolloSession).menus.bind(
        self as unknown as ApolloSession,
      )
      const superTrackActionMenuItems = (
        self as unknown as AbstractSessionModel
      ).getTrackActionMenuItems
      return {
        menus() {
          const role = getRole(self)
          if (!role || role === 'none') {
            return superMenus()
          }
          const readOnly = isReadOnly(self)
          const apolloMenuItems = [
            ...(readOnly
              ? []
              : [
                  {
                    label: 'Edit',
                    type: 'subMenu' as const,
                    icon: EditIcon,
                    subMenu: [
                      {
                        label: 'Undo',
                        icon: UndoIcon,
                        onClick(session: ApolloSessionModel) {
                          void session.apolloDataStore.featureService.undoLastChange()
                        },
                      },
                      {
                        label: 'Redo',
                        icon: RedoIcon,
                        onClick(session: ApolloSessionModel) {
                          void session.apolloDataStore.featureService.redoLastChange()
                        },
                      },
                      {
                        label: 'Open local GFF3 file',
                        icon: FileOpenIcon,
                        onClick: (session: ApolloSessionModel) => {
                          ;(
                            session as unknown as AbstractSessionModel
                          ).queueDialog((doneCallback) => [
                            OpenLocalFile,
                            {
                              session,
                              handleClose: () => {
                                doneCallback()
                              },
                              inMemoryFileDriver:
                                session.apolloDataStore.inMemoryFileDriver,
                            },
                          ])
                        },
                      },
                      {
                        label: 'Lock/Unlock session',
                        icon: LockIcon,
                        onClick: (session: ApolloSessionModel) => {
                          session.toggleLocked()
                        },
                      },
                    ],
                  },
                ]),
            {
              label: 'View',
              type: 'subMenu' as const,
              icon: VisibilityIcon,
              subMenu: [
                {
                  label: 'Download GFF3',
                  icon: DownloadIcon,
                  onClick: (session: ApolloSessionModel) => {
                    ;(session as unknown as AbstractSessionModel).queueDialog(
                      (doneCallback) => [
                        DownloadGFF3,
                        {
                          session,
                          handleClose: () => {
                            doneCallback()
                          },
                        },
                      ],
                    )
                  },
                },
                {
                  label: 'Change log',
                  icon: TrackChangesIcon,
                  onClick: (session: ApolloSessionModel) => {
                    ;(session as unknown as AbstractSessionModel).queueDialog(
                      (doneCallback) => [
                        ViewChangeLog,
                        {
                          session,
                          handleClose: () => {
                            doneCallback()
                          },
                        },
                      ],
                    )
                  },
                },
                {
                  label: 'Check results',
                  icon: FactCheckIcon,
                  onClick: (session: ApolloSessionModel) => {
                    ;(session as unknown as AbstractSessionModel).queueDialog(
                      (doneCallback) => [
                        ViewCheckResults,
                        {
                          session,
                          handleClose: () => {
                            doneCallback()
                          },
                        },
                      ],
                    )
                  },
                },
              ],
            },
            {
              label: 'Log out',
              icon: LogoutIcon,
              onClick: (session: ApolloSessionModel) => {
                ;(session as unknown as AbstractSessionModel).queueDialog(
                  (doneCallback) => [
                    LogOut,
                    {
                      session,
                      handleClose: () => {
                        doneCallback()
                      },
                    },
                  ],
                )
              },
            },
          ]
          return [
            ...superMenus(),
            { label: 'Apollo', menuItems: apolloMenuItems },
          ]
        },
        getTrackActionMenuItems(conf: BaseTrackConfig) {
          if (
            conf.type === 'ApolloTrack' ||
            conf.type === 'ReferenceSequenceTrack'
          ) {
            return superTrackActionMenuItems?.(conf)
          }
          const trackId = readConfObject(conf, 'trackId') as string
          const sessionTrackIdentifier = '-sessionTrack'
          const isSessionTrack = trackId.endsWith(sessionTrackIdentifier)
          return isSessionTrack
            ? [
                ...(superTrackActionMenuItems?.(conf) ?? []),
                {
                  label: 'Save track to Apollo',
                  onClick: async () => {
                    const baseURL = getBaseURL(
                      self as unknown as ApolloSessionModel,
                    )
                    const { jbrowse } = getRoot<ApolloRootModel>(self)
                    const trackConfigSnapshot = getSnapshot(conf)
                    const newTrackId = trackId.slice(
                      0,
                      trackId.length - sessionTrackIdentifier.length,
                    )
                    const newTrackConfigSnapshot = {
                      ...trackConfigSnapshot,
                      trackId: newTrackId,
                    }
                    const assemblyIds = readConfObject(
                      conf,
                      'assemblyNames',
                    ) as string[]
                    const uri = new URL('tracks', baseURL).href
                    const response = await fetch(uri, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        trackId: newTrackId,
                        assemblyIds,
                        config: newTrackConfigSnapshot,
                      }),
                    })
                    const { notify } = self as unknown as AbstractSessionModel
                    if (!response.ok) {
                      const errorMessage = await createFetchErrorMessage(
                        response,
                        'Failed to save track',
                      )
                      notify(errorMessage, 'error')
                      return
                    }
                    notify('Track added', 'success')
                    // @ts-expect-error This method is missing in the JB types
                    self.deleteTrackConf(conf)
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                    jbrowse.addTrackConf(newTrackConfigSnapshot)
                  },
                  icon: SaveIcon,
                },
              ]
            : [
                ...(superTrackActionMenuItems?.(conf) ?? []),
                {
                  label: 'Remove track from Apollo',
                  onClick: async () => {
                    const baseURL = getBaseURL(
                      self as unknown as ApolloSessionModel,
                    )
                    const { jbrowse } = getRoot<ApolloRootModel>(self)
                    const listUri = new URL('tracks', baseURL).href
                    const listResponse = await fetch(listUri, {
                      method: 'GET',
                    })
                    const { notify } = self as unknown as AbstractSessionModel
                    if (!listResponse.ok) {
                      const errorMessage = await createFetchErrorMessage(
                        listResponse,
                        'Failed to find track',
                      )
                      notify(errorMessage, 'error')
                      return
                    }
                    const tracks = (await listResponse.json()) as {
                      _id: string
                      trackId: string
                    }[]
                    const track = tracks.find((t) => t.trackId === trackId)
                    if (track) {
                      const deleteUri = new URL(`tracks/${track._id}`, baseURL)
                        .href
                      const deleteResponse = await fetch(deleteUri, {
                        method: 'DELETE',
                      })
                      if (!deleteResponse.ok) {
                        const errorMessage = await createFetchErrorMessage(
                          deleteResponse,
                          'Failed to remove track',
                        )
                        notify(errorMessage, 'error')
                        return
                      }
                    }
                    notify('Track removed', 'success')
                    // @ts-expect-error This method is missing in the JB types
                    self.deleteTrackConf(conf)
                    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
                    jbrowse.deleteTrackConf(conf)
                  },
                  icon: SaveIcon,
                },
              ]
        },
      }
    })
  return types.snapshotProcessor(sm, {
    postProcessor(snap: SnapshotOut<typeof sm>, node) {
      snap.apolloSelectedFeature = undefined
      const assemblies = Object.fromEntries(
        Object.entries(snap.apolloDataStore.assemblies).filter(
          ([, assembly]) => assembly.backendDriverType === 'InMemoryFileDriver',
        ),
      )
      // @ts-expect-error ontologyManager isn't actually required
      snap.apolloDataStore = {
        typeName: 'Client',
        assemblies,
        checkResults: {},
      }
      if (!node) {
        return snap
      }
      const { apolloDataStore } = node
      const { checkResults } = apolloDataStore
      for (const [, cr] of checkResults) {
        const feature = cr.featureId
        if (!feature) {
          continue
        }
        const assembly = apolloDataStore.assemblies.get(feature.assemblyId)
        if (assembly?.backendDriverType === 'InMemoryFileDriver') {
          snap.apolloDataStore.checkResults[cr._id] = getSnapshot(cr)
        }
      }
      return snap
    },
  })
}

export type ApolloSessionStateModel = ReturnType<typeof extendSession>
// @ts-expect-error Snapshots seem to mess up types here
// eslint disable because of
// https://mobx-state-tree.js.org/tips/typescript#using-a-mst-type-at-design-time
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ApolloSessionModel extends Instance<ApolloSessionStateModel> {}
