import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../../mikro-orm/database.service.js'
import { groupIntoGeneModels, parseGff3 } from '../parsers/gff3.js'
import { extractAssemblyFasta } from '../fasta-extract.js'
import { runCommand } from '../run-command.js'
import type { AnalysisRunner, BuildDbContext, RunContext } from '../runner.js'

const DB_DIR = process.env.BLAST_DB_DIR ?? './blast-dbs'

@Injectable()
export class MiniprotRunner implements AnalysisRunner {
  readonly tool = 'miniprot'

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private readonly logger = new Logger(MiniprotRunner.name)

  async isInstalled() {
    try {
      await runCommand('miniprot', ['--version'])
      return true
    } catch {
      return false
    }
  }

  async run(context: RunContext) {
    const query = String(context.job.params.query ?? '')
    const databaseId = String(context.job.params.databaseId ?? '')

    const analysisDb = await context.db.analysisDb.findById(databaseId)
    if (!analysisDb?.dbPath) {
      throw new Error(
        `Analysis database "${databaseId}" not found or not built`,
      )
    }

    const dbDir = path.resolve(DB_DIR)
    await mkdir(dbDir, { recursive: true })
    const tmpQuery = path.join(
      dbDir,
      `query-${Date.now()}-${Math.random().toString(36).slice(2)}.faa`,
    )
    await writeFile(tmpQuery, query)

    try {
      const { stdout } = await runCommand(
        'miniprot',
        ['--gff', analysisDb.dbPath, tmpQuery],
        context.signal,
      )

      const alignments = parseGff3(stdout)
      const geneModels = groupIntoGeneModels(alignments)
      return { alignments, geneModels, gff3: stdout }
    } finally {
      await rm(tmpQuery, { force: true })
    }
  }

  async buildDb(context: BuildDbContext) {
    const dbDir = path.resolve(DB_DIR)
    await mkdir(dbDir, { recursive: true })

    const fastaPath = path.join(dbDir, `${context.dbName}.fa`)
    const indexPath = path.join(dbDir, `${context.dbName}.mpi`)

    this.logger.log(
      `Extracting FASTA for assembly ${context.assemblyId} → ${fastaPath}`,
    )
    const refSeqs = await context.db.refSeq.findByAssembly(context.assemblyId)
    await extractAssemblyFasta(
      context.assemblyId,
      fastaPath,
      context.sequenceService,
      refSeqs,
    )

    this.logger.log(`Running miniprot -d → ${indexPath}`)
    await runCommand('miniprot', ['-d', indexPath, fastaPath])

    await rm(fastaPath, { force: true })
    return { dbPath: indexPath }
  }
}
