/* eslint-disable @typescript-eslint/no-unnecessary-condition */

import { openLocation } from '@jbrowse/core/util/io'
import equal from 'fast-deep-equal/es6'
import {
  type IDBPDatabase,
  type IDBPTransaction,
  openDB,
} from 'idb/with-async-ittr'

import { defaultTextIndexFields } from '..'

import { PREFIXED_ID_PATH, getWords } from './fulltext'
import {
  type OntologyDB,
  isOntologyDBEdge,
  isOntologyDBNode,
} from './indexeddb-schema'
import type { GraphDocument } from './obo-graph-json-schema'

import type OntologyStore from '.'

/** schema version we are currently on, used for the IndexedDB schema open call */
const schemaVersion = 2

export type Database = IDBPDatabase<OntologyDB>

/** open the IndexedDB and create the DB schema if necessary */
export async function openDatabase(this: OntologyStore, dbName: string) {
  // await deleteDB(dbName) // uncomment this to reload every time during development
  return openDB<OntologyDB>(dbName, schemaVersion, {
    upgrade(
      database: IDBPDatabase<OntologyDB>,
      oldVersion: number,
      newVersion: number | null,
      transaction: IDBPTransaction<
        OntologyDB,
        ArrayLike<'nodes' | 'edges' | 'meta'>,
        'versionchange'
      >,
      _event: IDBVersionChangeEvent,
    ): void {
      if (oldVersion < schemaVersion) {
        if (database.objectStoreNames.contains('meta')) {
          database.deleteObjectStore('meta')
        }
        if (database.objectStoreNames.contains('nodes')) {
          database.deleteObjectStore('nodes')
        }
        if (database.objectStoreNames.contains('edges')) {
          database.deleteObjectStore('edges')
        }
      }
      if (!database.objectStoreNames.contains('meta')) {
        database.createObjectStore('meta')
      }
      if (!database.objectStoreNames.contains('nodes')) {
        database.createObjectStore('nodes', { keyPath: 'id' })
        const nodes = transaction.objectStore('nodes')
        nodes.createIndex('by-label', 'lbl')
        nodes.createIndex('by-type', 'type')
        nodes.createIndex('by-synonym', ['meta', 'synonyms', 'val'])
        nodes.createIndex('full-text-words', 'fullTextWords', {
          multiEntry: true,
        })
      }
      if (!database.objectStoreNames.contains('edges')) {
        database.createObjectStore('edges', { autoIncrement: true })
        const edges = transaction.objectStore('edges')
        edges.createIndex('by-subject', 'sub')
        edges.createIndex('by-object', 'obj')
        edges.createIndex('by-predicate', 'pred')
      }
    },
  })
}

/** serialize all our words in the DB node so they can be indexed */
function serializeWords(foundWords: Iterable<[string, string]>): string[] {
  const allWords = new Set<string>()
  for (const [, word] of foundWords) {
    allWords.add(word)
  }
  return [...allWords]
}

/** load a OBO Graph JSON file into a database */
export async function loadOboGraphJson(this: OntologyStore, db: Database) {
  const startTime = Date.now()

  let percentProgress = 1
  this.options.update?.('Parsing JSON', percentProgress)
  // TODO: using file streaming along with an event-based json parser
  // instead of JSON.parse and .readFile could probably make this faster
  // and less memory intensive
  let oboGraph: GraphDocument
  try {
    oboGraph = JSON.parse(
      await openLocation(this.sourceLocation).readFile('utf8'),
    ) as GraphDocument
  } catch {
    throw new Error('Error in loading ontology')
  }

  percentProgress += 5
  this.options.update?.('Parsing JSON complete', percentProgress)

  const parseTime = Date.now()

  const [graph, ...additionalGraphs] = oboGraph.graphs ?? []
  if (!graph) {
    return
  }
  if (additionalGraphs.length > 0) {
    throw new Error('multiple graphs not supported')
  }

  try {
    // 'relaxed' durability skips flushing to disk after each write, which is
    // safe here because this is a rebuildable cache — if the browser crashes
    // mid-load, isDatabaseCurrent() will detect the incomplete state and
    // trigger a full reload on next startup
    const tx = db.transaction(['meta', 'nodes', 'edges'], 'readwrite', {
      durability: 'relaxed',
    })
    await tx.objectStore('meta').clear()
    await tx.objectStore('nodes').clear()
    await tx.objectStore('edges').clear()

    // load nodes
    const nodeStore = tx.objectStore('nodes')
    const fullTextIndexPaths = getTextIndexFields
      .call(this)
      .map((def) => def.jsonPath)
    if (graph.nodes) {
      this.options.update?.('Processing nodes', percentProgress)
      const nodeAdds: Promise<IDBValidKey>[] = []
      for (const node of graph.nodes) {
        if (isOntologyDBNode(node)) {
          nodeAdds.push(
            nodeStore.add({
              ...node,
              fullTextWords: serializeWords(
                getWords(node, fullTextIndexPaths, this.prefixes),
              ),
            }),
          )
        }
      }
      await Promise.all(nodeAdds)
      percentProgress += 64
    }

    // load edges
    const edgeStore = tx.objectStore('edges')
    if (graph.edges) {
      this.options.update?.('Processing edges', percentProgress)
      const edgeAdds: Promise<IDBValidKey>[] = []
      for (const edge of graph.edges) {
        if (isOntologyDBEdge(edge)) {
          edgeAdds.push(edgeStore.add(edge))
        }
      }
      await Promise.all(edgeAdds)
      percentProgress += 30
    }
    await tx.done

    // record some metadata about this ontology and load operation
    const tx2 = db.transaction('meta', 'readwrite')
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const { update, ...otherOptions } = this.options
    await tx2.objectStore('meta').add(
      {
        ontologyRecord: {
          name: this.ontologyName,
          version: this.ontologyVersion,
          sourceLocation: this.sourceLocation,
        },
        storeOptions: otherOptions,
        graphMeta: graph.meta,
        timestamp: String(new Date()),
        schemaVersion,
        timings: {
          overall: Date.now() - startTime,
          load: Date.now() - parseTime,
        },
      },
      'meta',
    )

    await tx2.done
  } catch (error) {
    await db.transaction('meta', 'readwrite').objectStore('meta').clear()
    throw error
  }
  return
}

export function getTextIndexFields(this: OntologyStore) {
  return [
    { displayName: 'ID', jsonPath: PREFIXED_ID_PATH },
    ...(this.options.textIndexing?.indexFields ?? defaultTextIndexFields),
  ]
}

export async function isDatabaseCurrent(this: OntologyStore, db: Database) {
  // since metadata is loaded last, we use it as a signal that all the other data
  // was loaded
  const [meta] = await db.transaction('meta').objectStore('meta').getAll()
  if (!meta) {
    return false
  }
  // check that the index paths and prefixes are the same as our current ones
  return (
    equal(this.options.prefixes, meta.storeOptions.prefixes) &&
    equal(this.options.textIndexing, meta.storeOptions.textIndexing)
  )
}
