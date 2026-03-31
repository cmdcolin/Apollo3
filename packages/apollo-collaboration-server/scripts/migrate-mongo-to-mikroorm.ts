/**
 * Migration script: MongoDB (Mongoose) -\> MikroORM (SQLite/PostgreSQL)
 *
 * Usage:
 *   node --experimental-strip-types scripts/migrate-mongo-to-mikroorm.ts \
 *     --mongo-uri "mongodb://localhost:27017/apollo" \
 *     --db-backend sqlite \
 *     --db-connection-url apollo3.sqlite
 *
 * Or with PostgreSQL:
 *   node --experimental-strip-types scripts/migrate-mongo-to-mikroorm.ts \
 *     --mongo-uri "mongodb://localhost:27017/apollo" \
 *     --db-backend postgresql \
 *     --db-connection-url "postgresql://user:pass@localhost:5432/apollo3"
 */

import { createMikroOrmConfig } from '@apollo-annotation/entities'
import { MikroORM } from '@mikro-orm/core'
import { MongoClient } from 'mongodb'

interface MigrationArgs {
  mongoUri: string
  dbBackend: 'sqlite' | 'postgresql'
  dbConnectionUrl: string
}

interface MongoFileDoc {
  _id: unknown
  basename: string
  checksum: string
  type: string
}

interface MongoUserDoc {
  _id: unknown
  username: string
  email: string
  role: string
  createdAt: Date
  updatedAt: Date
}

interface MongoCheckDoc {
  _id: unknown
  name: string
  causes: unknown
  isDefault: boolean
  version: number
  createdAt: Date
  updatedAt: Date
}

interface MongoAssemblyDoc {
  _id: unknown
  name: string
  status: string
  user: string
  displayName?: string
  aliases?: string[]
  description?: string
  externalLocation?: Record<string, unknown>
  fileIds?: Record<string, unknown>
  checks?: unknown[]
}

interface MongoRefSeqDoc {
  _id: unknown
  assembly: unknown
  name: string
  description?: string
  aliases?: string[]
  length: number
  status: string
  user: string
}

interface MongoFeatureDoc {
  _id: unknown
  refSeq: unknown
  createdAt?: Date
  updatedAt?: Date
  type: string
  min: number
  max: number
  strand?: 1 | -1
  phase?: 0 | 1 | 2
  attributes?: Map<string, string[]> | Record<string, string[]>
  status?: number
  user?: string
  children?: Map<string, MongoFeatureDoc> | Record<string, MongoFeatureDoc>
}

interface MongoCheckResultDoc {
  _id: unknown
  name?: string
  cause: string
  ids?: unknown[]
  refSeq: unknown
  start: number
  end: number
  ignored?: boolean
  message: string
}

interface MongoChangeDoc {
  _id: unknown
  assembly?: unknown
  typeName: string
  changedIds: string[]
  changes: unknown
  reverts?: unknown
  user: string
  sequence?: number
  createdAt?: Date
  updatedAt?: Date
}

interface MongoCounterDoc {
  _id: unknown
  id?: string
  sequenceValue?: number
}

interface MongoJBrowseConfigDoc {
  _id: unknown
  __v?: unknown
  [key: string]: unknown
}

interface MongoExportDoc {
  _id: unknown
  assembly: unknown
  createdAt: Date
}

const BATCH_SIZE = 500

function parseArgs(): MigrationArgs {
  const args = process.argv.slice(2)
  let mongoUri = ''
  let dbBackend: 'sqlite' | 'postgresql' = 'sqlite'
  let dbConnectionUrl = ''

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--mongo-uri': {
        mongoUri = args[++i] ?? ''
        break
      }
      case '--db-backend': {
        dbBackend = (args[++i] ?? 'sqlite') as 'sqlite' | 'postgresql'
        break
      }
      case '--db-connection-url': {
        dbConnectionUrl = args[++i] ?? ''
        break
      }
    }
  }

  if (!mongoUri || !dbConnectionUrl) {
    console.error(
      'Usage: node --experimental-strip-types scripts/migrate-mongo-to-mikroorm.ts --mongo-uri <uri> --db-backend <sqlite|postgresql> --db-connection-url <url>',
    )
    process.exit(1)
  }

  return { mongoUri, dbBackend, dbConnectionUrl }
}

function objectIdToString(val: unknown): string {
  if (val && typeof val === 'object' && 'toHexString' in val) {
    return (val as { toHexString(): string }).toHexString()
  }
  return String(val)
}

function objectIdArrayToStrings(arr: unknown[]): string[] {
  return arr.map((v) => objectIdToString(v))
}

interface FlatFeature {
  _id: string
  parentId: string | undefined
  refSeq: string
  assembly: string
  type: string
  min: number
  max: number
  strand?: 1 | -1
  phase?: 0 | 1 | 2
  attributes?: Record<string, string[]>
  status?: number
  user?: string
  createdAt?: Date
  updatedAt?: Date
}

function flattenFeature(
  doc: MongoFeatureDoc,
  refSeq: string,
  assembly: string,
  parentId: string | undefined,
  createdAt: Date | undefined,
  updatedAt: Date | undefined,
): FlatFeature[] {
  const result: FlatFeature[] = []
  const id = objectIdToString(doc._id)

  const feature: FlatFeature = {
    _id: id,
    parentId,
    refSeq,
    assembly,
    type: doc.type,
    min: doc.min,
    max: doc.max,
    createdAt,
    updatedAt,
  }

  if (doc.strand !== undefined) {
    feature.strand = doc.strand
  }
  if (doc.phase !== undefined) {
    feature.phase = doc.phase
  }
  if (doc.attributes) {
    feature.attributes =
      doc.attributes instanceof Map
        ? Object.fromEntries(doc.attributes)
        : doc.attributes
  }
  if (doc.status !== undefined) {
    feature.status = doc.status
  }
  if (doc.user) {
    feature.user = doc.user
  }

  result.push(feature)

  if (doc.children) {
    const entries =
      doc.children instanceof Map
        ? doc.children.entries()
        : Object.entries(doc.children)
    for (const [, child] of entries) {
      const childFeatures = flattenFeature(
        child,
        refSeq,
        assembly,
        id,
        createdAt,
        updatedAt,
      )
      for (const f of childFeatures) {
        result.push(f)
      }
    }
  }

  return result
}

async function migrate() {
  const { mongoUri, dbBackend, dbConnectionUrl } = parseArgs()

  console.log(`Connecting to MongoDB: ${mongoUri}`)
  const mongoClient = new MongoClient(mongoUri)
  await mongoClient.connect()
  const mongoDb = mongoClient.db()

  console.log(`Initializing MikroORM (${dbBackend}): ${dbConnectionUrl}`)
  const orm = await MikroORM.init({
    ...createMikroOrmConfig(dbBackend, dbConnectionUrl),
    allowGlobalContext: true,
  })
  await orm.schema.update()
  const { em } = orm

  // --- Files ---
  console.log('Migrating files...')
  const files = await mongoDb.collection<MongoFileDoc>('files').find().toArray()
  for (const f of files) {
    em.create('FileEntity', {
      _id: objectIdToString(f._id),
      basename: f.basename,
      checksum: f.checksum,
      type: f.type,
    })
  }
  await em.flush()
  em.clear()
  console.log(`  ${files.length} files migrated`)

  // --- Users ---
  console.log('Migrating users...')
  const users = await mongoDb.collection<MongoUserDoc>('users').find().toArray()
  for (const u of users) {
    em.create('UserEntity', {
      _id: objectIdToString(u._id),
      username: u.username,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    })
  }
  await em.flush()
  em.clear()
  console.log(`  ${users.length} users migrated`)

  // --- Checks ---
  console.log('Migrating checks...')
  const checks = await mongoDb
    .collection<MongoCheckDoc>('checks')
    .find()
    .toArray()
  for (const c of checks) {
    em.create('CheckEntity', {
      _id: objectIdToString(c._id),
      name: c.name,
      causes: c.causes,
      isDefault: c.isDefault,
      version: c.version,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    })
  }
  await em.flush()
  em.clear()
  console.log(`  ${checks.length} checks migrated`)

  // --- Assemblies ---
  console.log('Migrating assemblies...')
  const assemblies = await mongoDb
    .collection<MongoAssemblyDoc>('assemblies')
    .find()
    .toArray()
  for (const a of assemblies) {
    const row: Record<string, unknown> = {
      _id: objectIdToString(a._id),
      name: a.name,
      status: a.status,
      user: a.user,
    }
    if (a.displayName) {
      row.displayName = a.displayName
    }
    if (a.aliases) {
      row.aliases = a.aliases
    }
    if (a.description) {
      row.description = a.description
    }
    if (a.externalLocation) {
      row.sequenceSource = { type: 'fasta', ...a.externalLocation }
    } else if (a.fileIds) {
      const converted: Record<string, string> = {}
      for (const [key, val] of Object.entries(a.fileIds)) {
        converted[key] = objectIdToString(val)
      }
      if ('fai' in converted) {
        row.sequenceSource = { type: 'fasta', ...converted }
      } else {
        console.warn(
          `  Assembly "${a.name}" used chunked storage — FASTA must be re-imported`,
        )
      }
    }
    if (a.checks) {
      row.checks = objectIdArrayToStrings(a.checks)
    }
    em.create('AssemblyEntity', row)
  }
  await em.flush()
  em.clear()
  console.log(`  ${assemblies.length} assemblies migrated`)

  // --- RefSeqs (read for name mapping only, no table created) ---
  console.log('Reading refSeqs for name mapping...')
  const refSeqs = await mongoDb
    .collection<MongoRefSeqDoc>('refseqs')
    .find()
    .toArray()
  const refSeqIdToName = new Map<string, string>()
  const refSeqIdToAssembly = new Map<string, string>()
  for (const r of refSeqs) {
    const id = objectIdToString(r._id)
    refSeqIdToName.set(id, r.name)
    refSeqIdToAssembly.set(id, objectIdToString(r.assembly))
  }
  console.log(`  ${refSeqs.length} refSeqs read for mapping`)

  // RefSeqChunk storage has been removed. Assemblies that used chunked
  // sequence storage will need their FASTA re-imported after migration.
  const chunkCount = await mongoDb.collection('refseqchunks').countDocuments()
  if (chunkCount > 0) {
    console.log(
      `  Skipping ${chunkCount} refSeqChunks (chunked storage removed).`,
    )
    console.log(
      '  Assemblies that used chunked storage will need FASTA re-imported.',
    )
  }

  // --- Features (with tree flattening, batched) ---
  console.log('Migrating features...')
  const featuresCursor = mongoDb.collection<MongoFeatureDoc>('features').find()
  let featureCount = 0
  let flatFeatures: FlatFeature[] = []

  for await (const doc of featuresCursor) {
    const refSeqId = objectIdToString(doc.refSeq)
    const refSeq = refSeqIdToName.get(refSeqId) ?? refSeqId
    const assembly = refSeqIdToAssembly.get(refSeqId) ?? ''
    if (!refSeqIdToName.has(refSeqId)) {
      console.warn(`  Warning: refSeq ${refSeqId} not found in mapping`)
    }
    const flattened = flattenFeature(
      doc,
      refSeq,
      assembly,
      undefined,
      doc.createdAt,
      doc.updatedAt,
    )
    for (const f of flattened) {
      flatFeatures.push(f)
    }

    if (flatFeatures.length >= BATCH_SIZE) {
      for (const f of flatFeatures) {
        em.create('FeatureEntity', {
          _id: f._id,
          parent: f.parentId ?? null,
          refSeq: f.refSeq,
          assembly: f.assembly,
          type: f.type,
          min: f.min,
          max: f.max,
          strand: f.strand,
          phase: f.phase,
          attributes: f.attributes,
          status: f.status,
          user: f.user,
          createdAt: f.createdAt,
          updatedAt: f.updatedAt,
        })
      }
      await em.flush()
      em.clear()
      featureCount += flatFeatures.length
      flatFeatures = []
      process.stdout.write(`\r  ${featureCount} features...`)
    }
  }
  if (flatFeatures.length > 0) {
    for (const f of flatFeatures) {
      em.create('FeatureEntity', {
        _id: f._id,
        parent: f.parentId ?? null,
        refSeq: f.refSeq,
        assembly: f.assembly,
        type: f.type,
        min: f.min,
        max: f.max,
        strand: f.strand,
        phase: f.phase,
        attributes: f.attributes,
        status: f.status,
        user: f.user,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      })
    }
    await em.flush()
    em.clear()
    featureCount += flatFeatures.length
  }
  console.log(`\r  ${featureCount} features migrated`)

  // --- CheckResults ---
  console.log('Migrating checkResults...')
  const checkResults = await mongoDb
    .collection<MongoCheckResultDoc>('checkresults')
    .find()
    .toArray()
  for (const cr of checkResults) {
    const crRefSeqId = objectIdToString(cr.refSeq)
    const crRefSeqName = refSeqIdToName.get(crRefSeqId) ?? crRefSeqId
    const crAssembly = refSeqIdToAssembly.get(crRefSeqId) ?? ''
    em.create('CheckResultEntity', {
      _id: objectIdToString(cr._id),
      name: cr.name ?? '',
      cause: cr.cause,
      ids: objectIdArrayToStrings(cr.ids ?? []),
      refSeq: crRefSeqName,
      assembly: crAssembly,
      start: cr.start,
      end: cr.end,
      ignored: cr.ignored ?? false,
      message: cr.message,
    })
  }
  await em.flush()
  em.clear()
  console.log(`  ${checkResults.length} checkResults migrated`)

  // --- Changes (batched) ---
  console.log('Migrating changes...')
  const changesCursor = mongoDb
    .collection<MongoChangeDoc>('changes')
    .find()
    .sort({ sequence: 1 })
  let changeCount = 0
  let changeBatch: MongoChangeDoc[] = []

  for await (const doc of changesCursor) {
    changeBatch.push(doc)
    if (changeBatch.length >= BATCH_SIZE) {
      for (const c of changeBatch) {
        em.create('ChangeEntity', {
          _id: objectIdToString(c._id),
          assembly: c.assembly ? objectIdToString(c.assembly) : undefined,
          typeName: c.typeName,
          changedIds: c.changedIds,
          changes: c.changes,
          reverts: c.reverts ? objectIdToString(c.reverts) : undefined,
          user: c.user,
          sequence: c.sequence,
          createdAt: c.createdAt,
          updatedAt: c.updatedAt,
        })
      }
      await em.flush()
      em.clear()
      changeCount += changeBatch.length
      changeBatch = []
      process.stdout.write(`\r  ${changeCount} changes...`)
    }
  }
  if (changeBatch.length > 0) {
    for (const c of changeBatch) {
      em.create('ChangeEntity', {
        _id: objectIdToString(c._id),
        assembly: c.assembly ? objectIdToString(c.assembly) : undefined,
        typeName: c.typeName,
        changedIds: c.changedIds,
        changes: c.changes,
        reverts: c.reverts ? objectIdToString(c.reverts) : undefined,
        user: c.user,
        sequence: c.sequence,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
      })
    }
    await em.flush()
    em.clear()
    changeCount += changeBatch.length
  }
  console.log(`\r  ${changeCount} changes migrated`)

  // --- Counters ---
  console.log('Migrating counters...')
  const counters = await mongoDb
    .collection<MongoCounterDoc>('counters')
    .find()
    .toArray()
  for (const c of counters) {
    em.create('CounterEntity', {
      _id: c.id ?? objectIdToString(c._id),
      sequenceValue: c.sequenceValue ?? 0,
    })
  }
  await em.flush()
  em.clear()
  console.log(`  ${counters.length} counters migrated`)

  // --- JBrowse Configs ---
  console.log('Migrating jbrowseConfigs...')
  const configs = await mongoDb
    .collection<MongoJBrowseConfigDoc>('jbrowseconfigs')
    .find()
    .toArray()
  for (const c of configs) {
    const id = objectIdToString(c._id)
    const { _id, __v, ...rest } = c
    em.create('JBrowseConfigEntity', {
      _id: id,
      config: rest,
    })
  }
  await em.flush()
  em.clear()
  console.log(`  ${configs.length} jbrowseConfigs migrated`)

  // --- Exports ---
  console.log('Migrating exports...')
  const exports = await mongoDb
    .collection<MongoExportDoc>('exports')
    .find()
    .toArray()
  for (const e of exports) {
    em.create('ExportEntity', {
      _id: objectIdToString(e._id),
      assembly: objectIdToString(e.assembly),
      createdAt: e.createdAt,
    })
  }
  await em.flush()
  em.clear()
  console.log(`  ${exports.length} exports migrated`)

  // --- Summary ---
  console.log('\nMigration complete!')
  console.log(`  Files: ${files.length}`)
  console.log(`  Users: ${users.length}`)
  console.log(`  Checks: ${checks.length}`)
  console.log(`  Assemblies: ${assemblies.length}`)
  console.log(`  RefSeqs: ${refSeqs.length} (used for name mapping only, no table created)`)
  console.log(`  RefSeqChunks: ${chunkCount} (skipped, storage removed)`)
  console.log(`  Features: ${featureCount}`)
  console.log(`  CheckResults: ${checkResults.length}`)
  console.log(`  Changes: ${changeCount}`)
  console.log(`  Counters: ${counters.length}`)
  console.log(`  JBrowseConfigs: ${configs.length}`)
  console.log(`  Exports: ${exports.length}`)

  await orm.close()
  await mongoClient.close()
}

migrate().catch((error: unknown) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
