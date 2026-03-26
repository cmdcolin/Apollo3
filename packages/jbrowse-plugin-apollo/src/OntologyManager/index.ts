import {
  type AnyConfigurationModel,
  ConfigurationSchema,
  readConfObject,
} from '@jbrowse/core/configuration'
import { openLocation } from '@jbrowse/core/util/io'
import {
  BlobLocation,
  LocalPathLocation,
  UriLocation,
} from '@jbrowse/core/util/types/mst'
import {
  type Instance,
  getRoot,
  getSnapshot,
  types,
} from '@jbrowse/mobx-state-tree'

import type ApolloPluginConfigurationSchema from '../config'
import type { ApolloRootModel } from '../types'

import { OntologyLookup, type OntologyNode } from './OntologyLookup'
import { type OboGraphDocument, parseOntology } from './obo-graph-parser'
import { applyPrefixes, expandPrefixes } from './prefixes'

export { type OntologyNode, isDeprecated } from './OntologyLookup'

export const OntologyRecordType = types
  .model('OntologyRecord', {
    name: types.string,
    version: 'unversioned',
    source: types.union(LocalPathLocation, UriLocation, BlobLocation),
  })
  .volatile(() => ({
    _lookup: undefined as OntologyLookup | undefined,
  }))
  .actions((self) => ({
    setLookup(lookup: OntologyLookup) {
      self._lookup = lookup
    },
  }))
  .actions((self) => ({
    loadOntology() {
      const { name } = self
      const source = getSnapshot(self.source)
      openLocation(source)
        .readFile('utf8')
        .then((text) => {
          const doc = JSON.parse(text) as OboGraphDocument
          const parsed = parseOntology(doc)
          self.setLookup(new OntologyLookup(name, parsed))
        })
        .catch((error: unknown) => {
          console.error('Failed to load ontology:', error)
          const parsed = parseOntology({ graphs: [] })
          self.setLookup(new OntologyLookup(name, parsed))
        })
    },
  }))
  .views((self) => ({
    isTypeOf(queryType: string, typeOf: string) {
      if (!self._lookup) {
        return queryType === typeOf
      }
      return self._lookup.isTypeOf(queryType, typeOf)
    },
    get dataStore() {
      return self._lookup
    },
  }))

export const OntologyManagerType = types
  .model('OntologyManager', {
    ontologies: types.array(OntologyRecordType),
    prefixes: types.optional(types.map(types.string), {
      'GO:': 'http://purl.obolibrary.org/obo/GO_',
      'SO:': 'http://purl.obolibrary.org/obo/SO_',
    }),
  })
  .views((self) => ({
    get featureTypeOntologyName(): string {
      const jbConfig = getRoot<ApolloRootModel>(self).jbrowse
        .configuration as AnyConfigurationModel
      const pluginConfiguration = jbConfig.ApolloPlugin as Instance<
        typeof ApolloPluginConfigurationSchema
      >
      return readConfObject(
        pluginConfiguration,
        'featureTypeOntologyName',
      ) as string
    },
  }))
  .views((self) => ({
    get featureTypeOntology() {
      return this.findOntology(self.featureTypeOntologyName)
    },
    findOntology(name: string, version?: string) {
      return self.ontologies.find(
        (record) =>
          record.name === name &&
          (version === undefined || record.version === version),
      )
    },
    applyPrefixes(uri: string) {
      return applyPrefixes(uri, self.prefixes)
    },
    expandPrefixes(uri: string) {
      return expandPrefixes(uri, self.prefixes)
    },
  }))
  .actions((self) => ({
    addOntology(
      name: string,
      version: string,
      source: Instance<typeof LocalPathLocation> | Instance<typeof UriLocation>,
    ) {
      const newlen = self.ontologies.push({ name, version, source })
      self.ontologies[newlen - 1].loadOntology()
    },
  }))

export default OntologyManagerType

export const OntologyRecordConfiguration = ConfigurationSchema(
  'OntologyRecord',
  {
    name: {
      type: 'string',
      description: 'the full name of the ontology, e.g. "Gene Ontology"',
      defaultValue: 'My Ontology',
    },
    version: {
      type: 'string',
      description: "the ontology's version string",
      defaultValue: 'unversioned',
    },
    source: {
      type: 'fileLocation',
      description: "the download location for the ontology's source file",
      defaultValue: {
        locationType: 'UriLocation',
        uri: 'http://example.com/myontology.json',
      },
    },
  },
)

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OntologyManager extends Instance<typeof OntologyManagerType> {}
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OntologyRecord extends Instance<typeof OntologyRecordType> {}

export type OntologyTerm = OntologyNode
export type OntologyClass = OntologyNode & { type: 'CLASS' }
export function isOntologyClass(term: OntologyNode): term is OntologyClass {
  return term.type === 'CLASS'
}
export type OntologyProperty = OntologyNode & { type: 'PROPERTY' }
export function isOntologyProperty(
  term: OntologyNode,
): term is OntologyProperty {
  return term.type === 'PROPERTY'
}
