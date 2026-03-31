import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import type { Logger } from '@nestjs/common'

import { readSequencesFromSource } from '../assemblies/assemblies.service.js'

import { extractAssemblyFasta } from './fasta-extract.js'
import { runCommand } from './run-command.js'
import type { BuildDbContext } from './runner.js'

const DB_DIR = process.env.BLAST_DB_DIR ?? './blast-dbs'

export async function buildTwoBitDb(
  context: BuildDbContext,
  logger: Logger,
): Promise<{ dbPath: string }> {
  const dbDir = path.resolve(DB_DIR)
  await mkdir(dbDir, { recursive: true })

  const fastaPath = path.join(dbDir, `${context.dbName}.fa`)
  const twoBitPath = path.join(dbDir, `${context.dbName}.2bit`)

  logger.log(
    `Extracting FASTA for assembly ${context.assemblyId} → ${fastaPath}`,
  )
  const assembly = await context.db.assembly.findById(context.assemblyId)
  if (!assembly?.sequenceSource) {
    throw new Error(`Assembly "${context.assemblyId}" has no sequence source`)
  }
  const refSeqs = await readSequencesFromSource(assembly.sequenceSource)
  await extractAssemblyFasta(
    assembly.name,
    fastaPath,
    context.sequenceService,
    refSeqs,
  )

  logger.log(`Running faToTwoBit → ${twoBitPath}`)
  await runCommand('faToTwoBit', [fastaPath, twoBitPath])

  await rm(fastaPath, { force: true })
  return { dbPath: twoBitPath }
}
