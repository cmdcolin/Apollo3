 
/* eslint-disable @typescript-eslint/consistent-type-imports */
import {
  type AssemblySpecificChange,
  type Change,
  type NestedFeature,
  assembleFeatureTrees,
  isAssemblySpecificChange,
} from '@apollo-annotation/common'
import type { FeatureRow, RefSeqRow } from '@apollo-annotation/common'
import type {
  AnnotationFeatureSnapshot,
  CheckResultSnapshot,
} from '@apollo-annotation/mst'
import {
  ValidationResultSet,
  gff3ToAnnotationFeature,
} from '@apollo-annotation/shared'
import { getConf } from '@jbrowse/core/configuration'
import { type Region, getSession } from '@jbrowse/core/util'
// MikroORM is loaded dynamically via require() in Electron environments
 
type MikroORM = import('@mikro-orm/core').MikroORM
import ObjectID from 'bson-objectid'

import type { SubmitOpts } from '../ChangeManager'

import { BackendDriver, type RefNameAliases } from './BackendDriver'
import { createLocalDataStore } from './createLocalDataStore'
import { getElectronRequire } from './electronRequire'

interface SQLiteAssemblyMetadata {
  apollo: boolean
  sqliteDb: string
  gff3File?: string
}

export class DesktopSQLiteDriver extends BackendDriver {
  private ormMap = new Map<string, MikroORM>()
  private initPromises = new Map<string, Promise<MikroORM>>()
  private importedAssemblies = new Set<string>()

  private async ensureORM(dbPath: string) {
    const existing = this.ormMap.get(dbPath)
    if (existing) {
      return existing
    }
    const pending = this.initPromises.get(dbPath)
    if (pending) {
      return pending
    }
    const promise = this.initORM(dbPath)
    this.initPromises.set(dbPath, promise)
    const orm = await promise
    this.initPromises.delete(dbPath)
    return orm
  }

  private async initORM(dbPath: string) {
    const electronRequire = getElectronRequire()
    const { createMikroOrmConfig } = electronRequire(
      '@apollo-annotation/entities',
    ) as typeof import('@apollo-annotation/entities')
    const { MikroORM: MikroORMClass } = electronRequire(
      '@mikro-orm/core',
    ) as typeof import('@mikro-orm/core')
    const config = createMikroOrmConfig('sqlite', dbPath)
    const orm = await MikroORMClass.init({
      ...config,
    })
    await orm.schema.update()
    this.ormMap.set(dbPath, orm)
    return orm
  }

  private getAssemblyMetadata(
    assemblyName: string,
  ): SQLiteAssemblyMetadata | undefined {
    const { assemblyManager } = getSession(this.clientStore)
    const assembly = assemblyManager.get(assemblyName)
    if (!assembly) {
      return undefined
    }
    const metadata = getConf(assembly, ['sequence', 'metadata']) as
      | SQLiteAssemblyMetadata
      | undefined
    if (metadata?.apollo && metadata.sqliteDb) {
      return metadata
    }
    return undefined
  }

  private async ensureAssemblyImported(assemblyName: string, orm: MikroORM) {
    if (this.importedAssemblies.has(assemblyName)) {
      return
    }

    const dataStore = createLocalDataStore(orm.em)
    const existingAssembly =
      await dataStore.assemblyRepository.findByName(assemblyName)
    if (existingAssembly) {
      this.importedAssemblies.add(assemblyName)
      return
    }

    const metadata = this.getAssemblyMetadata(assemblyName)
    if (metadata?.gff3File) {
      try {
        await this.importGFF3(assemblyName, metadata.gff3File, orm)
      } catch (error) {
        console.error(
          `Failed to import GFF3 for assembly ${assemblyName}:`,
          error,
        )
        throw error
      }
    } else {
      // FASTA-only project: create the assembly and refSeq rows in SQLite
      // so that features can be added with valid foreign keys.
      await this.createEmptyAssembly(assemblyName, orm)
    }
    this.importedAssemblies.add(assemblyName)
  }

  private async createEmptyAssembly(assemblyName: string, orm: MikroORM) {
    const dataStore = createLocalDataStore(orm.em)
    const assemblyId = new ObjectID().toHexString()
    await dataStore.assemblyRepository.create({
      _id: assemblyId,
      name: assemblyName,
    })

    const { assemblyManager } = getSession(this.clientStore)
    const assembly = assemblyManager.get(assemblyName)
    const regions = assembly?.regions ?? []

    const refSeqRows: RefSeqRow[] = []
    for (const region of regions) {
      const refSeqId = new ObjectID().toHexString()
      refSeqRows.push({
        _id: refSeqId,
        assembly: assemblyId,
        name: region.refName,
        length: region.end - region.start,
        chunkSize: 256 * 1024,
      })
    }
    if (refSeqRows.length > 0) {
      await dataStore.refSeqRepository.createMany(refSeqRows)
    }
  }

  private async importGFF3(
    assemblyName: string,
    gff3File: string,
    orm: MikroORM,
  ) {
    const electronRequire = getElectronRequire()
    const fs = electronRequire('node:fs') as typeof import('fs')
    const { parseStringSync } = electronRequire(
      '@gmod/gff',
    ) as typeof import('@gmod/gff')

    const fileContents = await fs.promises.readFile(gff3File, 'utf8')
    const gff3Result = parseStringSync(fileContents)

    const dataStore = createLocalDataStore(orm.em)

    const assemblyId = new ObjectID().toHexString()
    await dataStore.assemblyRepository.create({
      _id: assemblyId,
      name: assemblyName,
    })

    const { assemblyManager } = getSession(this.clientStore)
    const assembly = assemblyManager.get(assemblyName)
    const regions = assembly?.regions ?? []

    const refSeqMap = new Map<string, string>()
    const refSeqRows: RefSeqRow[] = []
    for (const region of regions) {
      const refSeqId = new ObjectID().toHexString()
      refSeqMap.set(region.refName, refSeqId)
      refSeqRows.push({
        _id: refSeqId,
        assembly: assemblyId,
        name: region.refName,
        length: region.end - region.start,
        chunkSize: 256 * 1024,
      })
    }
    if (refSeqRows.length > 0) {
      await dataStore.refSeqRepository.createMany(refSeqRows)
    }

    const allFeatureRows: FeatureRow[] = []
    for (const item of gff3Result) {
      if (!Array.isArray(item) || item.length === 0) {
        continue
      }
      const firstLoc = item[0]
      if (!firstLoc.seq_id) {
        continue
      }
      const refSeqId = refSeqMap.get(firstLoc.seq_id)
      if (!refSeqId) {
        continue
      }
      const snapshot = gff3ToAnnotationFeature(item, refSeqId)
      const rows = flattenFeatureSnapshot(snapshot, refSeqId)
      for (const row of rows) {
        allFeatureRows.push(row)
      }
    }

    if (allFeatureRows.length > 0) {
      const batchSize = 500
      for (let i = 0; i < allFeatureRows.length; i += batchSize) {
        const batch = allFeatureRows.slice(i, i + batchSize)
        await dataStore.featureRepository.createMany(batch)
      }
    }
  }

  private async getOrmForAssembly(assemblyName: string) {
    const metadata = this.getAssemblyMetadata(assemblyName)
    if (!metadata) {
      throw new Error(`Assembly ${assemblyName} is not configured for SQLite`)
    }
    const orm = await this.ensureORM(metadata.sqliteDb)
    await this.ensureAssemblyImported(assemblyName, orm)
    return orm
  }

  async getFeatures(
    region: Region,
  ): Promise<[AnnotationFeatureSnapshot[], CheckResultSnapshot[]]> {
    const orm = await this.getOrmForAssembly(region.assemblyName)
    const dataStore = createLocalDataStore(orm.em)

    const assemblyRow = await dataStore.assemblyRepository.findByName(
      region.assemblyName,
    )
    if (!assemblyRow) {
      return [[], []]
    }

    const refSeqRow = await dataStore.refSeqRepository.findByNameAndAssembly(
      region.refName,
      assemblyRow._id,
    )
    if (!refSeqRow) {
      return [[], []]
    }

    const rootRows = await dataStore.featureRepository.findRootsByRange(
      refSeqRow._id,
      region.start,
      region.end,
    )

    const allRows: FeatureRow[] = [...rootRows]
    for (const root of rootRows) {
      const descendants = await dataStore.featureRepository.findDescendants(
        root._id,
      )
      for (const d of descendants) {
        allRows.push(d)
      }
    }

    const nestedFeatures = assembleFeatureTrees(allRows)
    const snapshots = nestedFeatures.map((f) => nestedToSnapshot(f))

    return [snapshots, []]
  }

  // eslint-disable-next-line @typescript-eslint/require-await
  async getSequence(region: Region) {
    // Sequence is not stored in SQLite; the assembly's built-in sequence
    // adapter (IndexedFasta, BgzipFasta, etc.) handles sequence display.
    return { seq: '', refSeq: region.refName }
  }

  async getRegions(assemblyName: string): Promise<Region[]> {
    const orm = await this.getOrmForAssembly(assemblyName)
    const dataStore = createLocalDataStore(orm.em)

    const assemblyRow =
      await dataStore.assemblyRepository.findByName(assemblyName)
    if (!assemblyRow) {
      return []
    }

    const refSeqs = await dataStore.refSeqRepository.findByAssembly(
      assemblyRow._id,
    )
    return refSeqs.map((rs) => ({
      assemblyName,
      refName: rs.name,
      start: 0,
      end: rs.length,
    }))
  }

  getAssemblies() {
    const { assemblyManager } = getSession(this.clientStore)
    return assemblyManager.assemblies.filter((assembly) => {
      const sequenceMetadata = getConf(assembly, ['sequence', 'metadata']) as
        | { apollo?: boolean; sqliteDb?: string }
        | undefined
      return Boolean(sequenceMetadata?.apollo && sequenceMetadata.sqliteDb)
    })
  }

  async getRefNameAliases(assemblyName: string): Promise<RefNameAliases[]> {
    const orm = await this.getOrmForAssembly(assemblyName)
    const dataStore = createLocalDataStore(orm.em)

    const assemblyRow =
      await dataStore.assemblyRepository.findByName(assemblyName)
    if (!assemblyRow) {
      return []
    }

    const refSeqs = await dataStore.refSeqRepository.findByAssembly(
      assemblyRow._id,
    )
    return refSeqs.map((rs) => ({
      refName: rs.name,
      aliases: [rs._id, ...(rs.aliases ?? [])],
      uniqueId: `alias-${rs._id}`,
    }))
  }

  private async buildRefNameToIdMap(assemblyName: string, orm: MikroORM) {
    const dataStore = createLocalDataStore(orm.em)
    const assemblyRow =
      await dataStore.assemblyRepository.findByName(assemblyName)
    if (!assemblyRow) {
      return new Map<string, string>()
    }
    const refSeqs = await dataStore.refSeqRepository.findByAssembly(
      assemblyRow._id,
    )
    const map = new Map<string, string>()
    for (const rs of refSeqs) {
      map.set(rs.name, rs._id)
    }
    return map
  }

  async submitChange(change: Change, _opts: SubmitOpts) {
    if (!isAssemblySpecificChange(change)) {
      throw new Error(
        `Cannot use this type of change with desktop SQLite: "${change.typeName}"`,
      )
    }
    const assemblyChange = change
    const orm = await this.getOrmForAssembly(assemblyChange.assembly)

    // Translate refNames to refSeq IDs in the change's feature snapshots.
    // The client uses refNames (e.g. 'ctgA') but SQLite FKs require the
    // refSeq row's _id.
    const refNameMap = await this.buildRefNameToIdMap(
      assemblyChange.assembly,
      orm,
    )
    this.patchRefSeqIds(change, refNameMap)

    await orm.em.transactional(async (txEm) => {
      const dataStore = createLocalDataStore(txEm)
      await change.execute(dataStore)
    })
    return new ValidationResultSet()
  }

   
  private patchRefSeqIds(change: Change, refNameMap: Map<string, string>) {
     
    const c = change as unknown as Record<string, unknown>
    if ('changes' in c && Array.isArray(c.changes)) {
      for (const sub of c.changes) {
        if (sub.addedFeature) {
          this.patchFeatureRefSeq(sub.addedFeature, refNameMap)
        }
      }
    }
  }

  private patchFeatureRefSeq(
    feature: AnnotationFeatureSnapshot,
    refNameMap: Map<string, string>,
  ) {
    const mapped = refNameMap.get(feature.refSeq)
    if (mapped) {
      feature.refSeq = mapped
    }
    if (feature.children) {
      for (const child of Object.values(feature.children)) {
        this.patchFeatureRefSeq(child, refNameMap)
      }
    }
  }

  async searchFeatures(
    term: string,
    assemblies: string[],
  ): Promise<AnnotationFeatureSnapshot[]> {
    const results: AnnotationFeatureSnapshot[] = []
    for (const assemblyName of assemblies) {
      const orm = await this.getOrmForAssembly(assemblyName)
      const dataStore = createLocalDataStore(orm.em)
      const assemblyRow =
        await dataStore.assemblyRepository.findByName(assemblyName)
      if (!assemblyRow) {
        continue
      }
      const refSeqs = await dataStore.refSeqRepository.findByAssembly(
        assemblyRow._id,
      )
      const refSeqIds = refSeqs.map((rs) => rs._id)
      const rows = await dataStore.featureRepository.searchText(refSeqIds, term)
      const nestedFeatures = assembleFeatureTrees(rows)
      for (const f of nestedFeatures) {
        results.push(nestedToSnapshot(f))
      }
    }
    return results
  }
}

function flattenFeatureSnapshot(
  snapshot: AnnotationFeatureSnapshot,
  refSeq: string,
  parentId?: string,
) {
  const rows: FeatureRow[] = []
  const row: FeatureRow = {
    _id: snapshot._id,
    refSeq,
    parentId,
    type: snapshot.type,
    min: snapshot.min,
    max: snapshot.max,
    strand: snapshot.strand,
    attributes: snapshot.attributes as Record<string, string[]> | undefined,
  }
  rows.push(row)
  if (snapshot.children) {
    for (const child of Object.values(snapshot.children)) {
      const childRows = flattenFeatureSnapshot(child, refSeq, snapshot._id)
      for (const cr of childRows) {
        rows.push(cr)
      }
    }
  }
  return rows
}

function nestedToSnapshot(nested: NestedFeature): AnnotationFeatureSnapshot {
  const snapshot: AnnotationFeatureSnapshot = {
    _id: nested._id,
    refSeq: nested.refSeq,
    type: nested.type,
    min: nested.min,
    max: nested.max,
  }
  if (nested.strand !== undefined) {
    snapshot.strand = nested.strand
  }
  if (nested.attributes) {
    snapshot.attributes = nested.attributes
  }
  if (nested.children) {
    const children: Record<string, AnnotationFeatureSnapshot> = {}
    for (const [id, child] of Object.entries(nested.children)) {
      children[id] = nestedToSnapshot(child)
    }
    snapshot.children = children
  }
  return snapshot
}
