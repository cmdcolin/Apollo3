import { mkdir, rm } from 'node:fs/promises'
import path from 'node:path'

import type { Logger } from '@nestjs/common'

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
  const refSeqs = await context.db.refSeq.findByAssembly(context.assemblyId)
  await extractAssemblyFasta(
    context.assemblyId,
    fastaPath,
    context.sequenceService,
    refSeqs,
  )

  logger.log(`Running faToTwoBit → ${twoBitPath}`)
  await runCommand('faToTwoBit', [fastaPath, twoBitPath])

  await rm(fastaPath, { force: true })
  return { dbPath: twoBitPath }
}
