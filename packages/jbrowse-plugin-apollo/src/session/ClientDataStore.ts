/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import type { ClientDataStore as ClientDataStoreType } from '@apollo-annotation/common'
import {
  type AnnotationFeatureModel,
  type AnnotationFeatureSnapshot,
  ApolloAssembly,
  type ApolloAssemblySnapshot,
  ApolloRefSeq,
  type BackendDriverType,
  CheckResult,
  type CheckResultSnapshot,
} from '@apollo-annotation/mst'
import {
  type AnyConfigurationModel,
  getConf,
  readConfObject,
} from '@jbrowse/core/configuration'
import { type Region, getSession, isElectron } from '@jbrowse/core/util'
import type {
  LocalPathLocation,
  UriLocation,
} from '@jbrowse/core/util/types/mst'
import {
  type Instance,
  addDisposer,
  flow,
  getParentOfType,
  getRoot,
  resolveIdentifier,
  types,
} from '@jbrowse/mobx-state-tree'
import { autorun } from 'mobx'

import {
  type BackendDriver,
  CollaborationServerDriver,
  DesktopFileDriver,
  DesktopSQLiteDriver,
  InMemoryFileDriver,
} from '../BackendDrivers'
import { ChangeManager } from '../ChangeManager'
import { OntologyManagerType } from '../OntologyManager'
import type ApolloPluginConfigurationSchema from '../config'
import type { ApolloRootModel } from '../types'

import type { ApolloSessionModel } from './session'

export function clientDataStoreFactory(
  AnnotationFeatureExtended: typeof AnnotationFeatureModel,
) {
  return types
    .model('ClientDataStore', {
      typeName: types.optional(types.literal('Client'), 'Client'),
      assemblies: types.map(ApolloAssembly),
      checkResults: types.map(CheckResult),
      ontologyManager: types.optional(OntologyManagerType, {}),
    })
    .views((self) => ({
      get pluginConfiguration() {
        return getRoot<ApolloRootModel>(self).jbrowse.configuration
          .ApolloPlugin as Instance<typeof ApolloPluginConfigurationSchema>
      },
      getFeature(featureId: string) {
        return resolveIdentifier(
          AnnotationFeatureExtended,
          self.assemblies,
          featureId,
        )
      },
    }))
    .actions((self) => ({
      addAssembly(assemblyId: string, backendDriverType?: BackendDriverType) {
        const assemblySnapshot: ApolloAssemblySnapshot = {
          _id: assemblyId,
          refSeqs: {},
        }
        if (backendDriverType) {
          assemblySnapshot.backendDriverType = backendDriverType
        }
        return self.assemblies.put(assemblySnapshot)
      },
    }))
    .actions((self) => ({
      addFeature(assemblyId: string, feature: AnnotationFeatureSnapshot) {
        const session = getSession(self)
        const { assemblyManager } = session
        let apolloAssembly = self.assemblies.get(assemblyId)
        if (!apolloAssembly) {
          const assembly = assemblyManager.get(assemblyId)
          if (!assembly) {
            throw new Error(
              `Could not find assembly "${assemblyId}" to add feature "${feature._id}"`,
            )
          }
          apolloAssembly = self.addAssembly(assemblyId)
        }
        let ref = apolloAssembly.refSeqs.get(feature.refSeq)
        if (!ref) {
          const assembly = assemblyManager.get(assemblyId)
          if (!assembly) {
            throw new Error(
              `Could not find assembly "${assemblyId}" to add feature "${feature._id}"`,
            )
          }
          const canonicalRefName = assembly.getCanonicalRefName(feature.refSeq)
          if (!canonicalRefName) {
            throw new Error(
              `Could not find refSeq "${feature.refSeq}" to add feature "${feature._id}"`,
            )
          }
          ref = apolloAssembly.addRefSeq(feature.refSeq, canonicalRefName)
        }
        ref.features.put(feature)
      },
      deleteFeature(featureId: string) {
        const feature = self.getFeature(featureId)
        if (!feature) {
          throw new Error(`Could not find feature "${featureId}" to delete`)
        }
        const { _id, parent } = feature
        if (parent) {
          parent.deleteChild(featureId)
        } else {
          const refSeq = getParentOfType(feature, ApolloRefSeq)
          refSeq.deleteFeature(_id)
        }
      },
      deleteAssembly(assemblyId: string) {
        self.assemblies.delete(assemblyId)
      },
      addCheckResult(checkResult: CheckResultSnapshot) {
        self.checkResults.put(checkResult)
      },
      addCheckResults(checkResults: CheckResultSnapshot[]) {
        for (const checkResult of checkResults) {
          if (!self.checkResults.has(checkResult._id)) {
            self.checkResults.put(checkResult)
          }
        }
      },
      deleteCheckResult(checkResultId: string) {
        self.checkResults.delete(checkResultId)
      },
      clearCheckResults() {
        self.checkResults.clear()
      },
    }))
    .volatile((self) => ({
      changeManager: new ChangeManager(self as unknown as ClientDataStoreType),
      collaborationServerDriver: new CollaborationServerDriver(
        self as unknown as ClientDataStoreType,
      ),
      inMemoryFileDriver: new InMemoryFileDriver(
        self as unknown as ClientDataStoreType,
      ),
      desktopFileDriver: isElectron
        ? new DesktopFileDriver(self as unknown as ClientDataStoreType)
        : undefined,
      desktopSQLiteDriver: isElectron
        ? new DesktopSQLiteDriver(self as unknown as ClientDataStoreType)
        : undefined,
    }))
    .actions((self) => ({
      afterCreate() {
        addDisposer(
          self,
          autorun(() => {
            const { ontologyManager, pluginConfiguration } = self
            const configuredOntologies =
              pluginConfiguration.ontologies as AnyConfigurationModel[]
            for (const ont of configuredOntologies || []) {
              const name = readConfObject(ont, 'name') as string
              const version = readConfObject(ont, 'version') as string
              const source = readConfObject(ont, 'source') as
                | Instance<typeof LocalPathLocation>
                | Instance<typeof UriLocation>
              if (!ontologyManager.findOntology(name)) {
                ontologyManager.addOntology(name, version, source)
              }
            }
          }),
        )
      },
    }))
    .views((self) => ({
      getBackendDriver(assemblyId: string): BackendDriver | undefined {
        const session = getSession(self)
        const { assemblyManager } = session
        const assembly = assemblyManager.get(assemblyId)
        console.warn(
          `[apollo-debug] getBackendDriver: assemblyId=${assemblyId}, assembly=${!!assembly}`,
        )
        if (!assembly) {
          return
        }
        const metadata = getConf(assembly, ['sequence', 'metadata']) as {
          apollo?: boolean
          file?: string
          sqliteDb?: string
        }
        const { apollo, file, sqliteDb } = metadata
        console.warn(
          `[apollo-debug] getBackendDriver: metadata=${JSON.stringify(metadata)}, isElectron=${isElectron}`,
        )
        if (isElectron && sqliteDb) {
          return self.desktopSQLiteDriver
        }
        if (isElectron && file) {
          return self.desktopFileDriver
        }
        if (apollo) {
          return self.collaborationServerDriver
        }
        return self.inMemoryFileDriver
      },
    }))
    .actions((self) => ({
      loadFeatures: flow(function* loadFeatures(regions: Region[]) {
        for (const region of regions) {
          const backendDriver = self.getBackendDriver(region.assemblyName)
          if (!backendDriver) {
            return
          }
          const features = (yield backendDriver.getFeatures(
            region,
          )) as AnnotationFeatureSnapshot[]
          if (features.length === 0) {
            continue
          }
          const { assemblyName, refName } = region
          let assembly = self.assemblies.get(assemblyName)
          if (!assembly) {
            assembly = self.assemblies.put({ _id: assemblyName, refSeqs: {} })
          }
          const [firstFeature] = features
          let ref = assembly.refSeqs.get(firstFeature.refSeq)
          if (!ref) {
            ref = assembly.refSeqs.put({
              _id: firstFeature.refSeq,
              name: refName,
              features: {},
            })
          }
          for (const feature of features) {
            if (!ref.features.has(feature._id)) {
              ref.features.put(feature)
            }
          }
          const checkResults = (yield backendDriver.getCheckResults(
            region,
          )) as CheckResultSnapshot[]
          self.addCheckResults(checkResults)
        }
      }),
      loadRefSeq: flow(function* loadRefSeq(regions: Region[]) {
        for (const region of regions) {
          const backendDriver = self.getBackendDriver(region.assemblyName)
          if (!backendDriver) {
            return
          }
          const { refSeq, seq } = yield backendDriver.getSequence(region)
          const { assemblyName, end, refName, start } = region
          let assembly = self.assemblies.get(assemblyName)
          if (!assembly) {
            assembly = self.assemblies.put({ _id: assemblyName, refSeqs: {} })
          }
          let ref = assembly.refSeqs.get(refSeq)
          if (!ref) {
            ref = assembly.refSeqs.put({
              _id: refSeq,
              name: refName,
              sequence: [],
            })
          }
          ref.addSequence({ start, stop: end, sequence: seq })
        }
      }),
    }))
}
