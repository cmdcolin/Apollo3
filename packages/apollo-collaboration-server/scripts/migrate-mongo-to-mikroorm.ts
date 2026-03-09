/**
 * Migration script: MongoDB (Mongoose) -> MikroORM (SQLite/PostgreSQL)
 *
 * Usage:
 *   npx ts-node scripts/migrate-mongo-to-mikroorm.ts \
 *     --mongo-uri "mongodb://localhost:27017/apollo" \
 *     --db-backend sqlite \
 *     --db-connection-url apollo3.sqlite
 *
 * Or with PostgreSQL:
 *   npx ts-node scripts/migrate-mongo-to-mikroorm.ts \
 *     --mongo-uri "mongodb://localhost:27017/apollo" \
 *     --db-backend postgresql \
 *     --db-connection-url "postgresql://user:pass@localhost:5432/apollo3"
 */

/* eslint-disable @typescript-eslint/no-require-imports */
import { MikroORM } from '@mikro-orm/core'
import { MongoClient } from 'mongodb'

import { createMikroOrmConfig } from '@apollo-annotation/entities'

interface MigrationArgs {
  mongoUri: string
  dbBackend: 'sqlite' | 'postgresql'
  dbConnectionUrl: string
}

function parseArgs(): MigrationArgs {
  const args = process.argv.slice(2)
  let mongoUri = ''
  let dbBackend: 'sqlite' | 'postgresql' = 'sqlite'
  let dbConnectionUrl = ''

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--mongo-uri') {
      mongoUri = args[++i]
    } else if (args[i] === '--db-backend') {
      dbBackend = args[++i] as 'sqlite' | 'postgresql'
    } else if (args[i] === '--db-connection-url') {
      dbConnectionUrl = args[++i]
    }
  }

  if (!mongoUri || !dbConnectionUrl) {
    console.error(
      'Usage: npx ts-node scripts/migrate-mongo-to-mikroorm.ts --mongo-uri <uri> --db-backend <sqlite|postgresql> --db-connection-url <url>',
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
  doc: Record<string, unknown>,
  refSeq: string,
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
    type: doc.type as string,
    min: doc.min as number,
    max: doc.max as number,
    createdAt,
    updatedAt,
  }

  if (doc.strand !== undefined && doc.strand !== null) {
    feature.strand = doc.strand as 1 | -1
  }
  if (doc.phase !== undefined && doc.phase !== null) {
    feature.phase = doc.phase as 0 | 1 | 2
  }
  if (doc.attributes) {
    const attrs = doc.attributes as
      | Map<string, string[]>
      | Record<string, string[]>
    if (attrs instanceof Map) {
      feature.attributes = Object.fromEntries(attrs)
    } else {
      feature.attributes = attrs
    }
  }
  if (doc.status !== undefined && doc.status !== null) {
    feature.status = doc.status as number
  }
  if (doc.user) {
    feature.user = doc.user as string
  }

  result.push(feature)

  if (doc.children) {
    const children = doc.children as
      | Map<string, Record<string, unknown>>
      | Record<string, Record<string, unknown>>
    const entries =
      children instanceof Map ? children.entries() : Object.entries(children)
    for (const [, child] of entries) {
      const childFeatures = flattenFeature(
        child,
        refSeq,
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
  const generator = orm.getSchemaGenerator()
  await generator.updateSchema()
  const em = orm.em

  // --- Files ---
  console.log('Migrating files...')
  const files = await mongoDb.collection('files').find().toArray()
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
  const users = await mongoDb.collection('users').find().toArray()
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
  const checks = await mongoDb.collection('checks').find().toArray()
  for (const c of checks) {
    em.create('CheckEntity', {
      _id: objectIdToString(c._id),
      name: c.name ?? '',
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
  const assemblies = await mongoDb.collection('assemblies').find().toArray()
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
      row.sequenceSource = { type: 'external', ...a.externalLocation }
    } else if (a.fileIds) {
      const ids = a.fileIds as Record<string, unknown>
      const converted: Record<string, string> = {}
      for (const [key, val] of Object.entries(ids)) {
        converted[key] = objectIdToString(val)
      }
      if ('fai' in converted) {
        row.sequenceSource = { type: 'indexed', ...converted }
      } else {
        row.sequenceSource = { type: 'chunked', ...converted }
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

  // --- RefSeqs ---
  console.log('Migrating refSeqs...')
  const refSeqs = await mongoDb.collection('refseqs').find().toArray()
  for (const r of refSeqs) {
    em.create('RefSeqEntity', {
      _id: objectIdToString(r._id),
      assembly: objectIdToString(r.assembly),
      name: r.name,
      description: r.description,
      aliases: r.aliases,
      length: r.length,
      chunkSize: r.chunkSize ?? 256 * 1024,
      status: r.status,
      user: r.user,
    })
  }
  await em.flush()
  em.clear()
  console.log(`  ${refSeqs.length} refSeqs migrated`)

  // --- RefSeqChunks (batched - can be very large) ---
  console.log('Migrating refSeqChunks...')
  const chunksCursor = mongoDb.collection('refseqchunks').find()
  let chunkCount = 0
  const BATCH_SIZE = 500
  let batch: Record<string, unknown>[] = []

  for await (const c of chunksCursor) {
    batch.push(c)
    if (batch.length >= BATCH_SIZE) {
      for (const doc of batch) {
        em.create('RefSeqChunkEntity', {
          _id: objectIdToString(doc._id),
          refSeq: objectIdToString(doc.refSeq),
          n: doc.n as number,
          sequence: doc.sequence as string,
          status: doc.status as number | undefined,
          user: doc.user as string | undefined,
        })
      }
      await em.flush()
      em.clear()
      chunkCount += batch.length
      batch = []
      process.stdout.write(`\r  ${chunkCount} chunks...`)
    }
  }
  if (batch.length > 0) {
    for (const doc of batch) {
      em.create('RefSeqChunkEntity', {
        _id: objectIdToString(doc._id),
        refSeq: objectIdToString(doc.refSeq),
        n: doc.n as number,
        sequence: doc.sequence as string,
        status: doc.status as number | undefined,
        user: doc.user as string | undefined,
      })
    }
    await em.flush()
    em.clear()
    chunkCount += batch.length
  }
  console.log(`\r  ${chunkCount} refSeqChunks migrated`)

  // --- Features (with tree flattening, batched) ---
  console.log('Migrating features...')
  const featuresCursor = mongoDb.collection('features').find()
  let featureCount = 0
  let flatFeatures: FlatFeature[] = []

  for await (const doc of featuresCursor) {
    const refSeq = objectIdToString(doc.refSeq)
    const flattened = flattenFeature(
      doc as unknown as Record<string, unknown>,
      refSeq,
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
  const checkResults = await mongoDb.collection('checkresults').find().toArray()
  for (const cr of checkResults) {
    em.create('CheckResultEntity', {
      _id: objectIdToString(cr._id),
      name: cr.name ?? '',
      cause: cr.cause,
      ids: objectIdArrayToStrings(cr.ids ?? []),
      refSeq: objectIdToString(cr.refSeq),
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
    .collection('changes')
    .find()
    .sort({ sequence: 1 })
  let changeCount = 0
  let changeBatch: Record<string, unknown>[] = []

  for await (const doc of changesCursor) {
    changeBatch.push(doc)
    if (changeBatch.length >= BATCH_SIZE) {
      for (const c of changeBatch) {
        em.create('ChangeEntity', {
          _id: objectIdToString(c._id),
          assembly: c.assembly ? objectIdToString(c.assembly) : undefined,
          typeName: c.typeName as string,
          changedIds: c.changedIds as string[],
          changes: c.changes,
          reverts: c.reverts ? objectIdToString(c.reverts) : undefined,
          user: c.user as string,
          sequence: c.sequence as number | undefined,
          createdAt: c.createdAt as Date | undefined,
          updatedAt: c.updatedAt as Date | undefined,
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
        typeName: c.typeName as string,
        changedIds: c.changedIds as string[],
        changes: c.changes,
        reverts: c.reverts ? objectIdToString(c.reverts) : undefined,
        user: c.user as string,
        sequence: c.sequence as number | undefined,
        createdAt: c.createdAt as Date | undefined,
        updatedAt: c.updatedAt as Date | undefined,
      })
    }
    await em.flush()
    em.clear()
    changeCount += changeBatch.length
  }
  console.log(`\r  ${changeCount} changes migrated`)

  // --- Counters ---
  console.log('Migrating counters...')
  const counters = await mongoDb.collection('counters').find().toArray()
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
  const configs = await mongoDb.collection('jbrowseconfigs').find().toArray()
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
  const exports = await mongoDb.collection('exports').find().toArray()
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
  console.log(`  RefSeqs: ${refSeqs.length}`)
  console.log(`  RefSeqChunks: ${chunkCount}`)
  console.log(`  Features: ${featureCount}`)
  console.log(`  CheckResults: ${checkResults.length}`)
  console.log(`  Changes: ${changeCount}`)
  console.log(`  Counters: ${counters.length}`)
  console.log(`  JBrowseConfigs: ${configs.length}`)
  console.log(`  Exports: ${exports.length}`)

  await orm.close()
  await mongoClient.close()
}

migrate().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
