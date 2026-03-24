import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../../mikro-orm/database.service.js'
import { extractAssemblyFasta } from '../fasta-extract.js'
import { runCommand } from '../run-command.js'
import type { AnalysisRunner, BuildDbContext, RunContext } from '../runner.js'

const DB_DIR = process.env.BLAST_DB_DIR ?? './blast-dbs'

@Injectable()
export class LocalBlastRunner implements AnalysisRunner {
  readonly tool = 'local-blast'

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private readonly logger = new Logger(LocalBlastRunner.name)

  async isInstalled() {
    try {
      await runCommand('makeblastdb', ['-version'])
      return true
    } catch {
      return false
    }
  }

  async run(context: RunContext) {
    const program = String(context.job.params.program ?? '')
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
      `query-${Date.now()}-${Math.random().toString(36).slice(2)}.fa`,
    )
    await writeFile(tmpQuery, query)

    try {
      const { stdout } = await runCommand(
        program,
        [
          '-query',
          tmpQuery,
          '-db',
          analysisDb.dbPath,
          '-outfmt',
          '15',
          '-evalue',
          '1e-5',
          '-max_target_seqs',
          '50',
        ],
        context.signal,
      )

      const parsed = JSON.parse(stdout)
      if (parsed.BlastOutput2 && Array.isArray(parsed.BlastOutput2)) {
        return parsed.BlastOutput2[0]
      }
      return parsed
    } finally {
      await rm(tmpQuery, { force: true })
    }
  }

  async buildDb(context: BuildDbContext) {
    const program = String(context.params.program ?? '')
    const dbType = ['blastp', 'blastx'].includes(program) ? 'prot' : 'nucl'

    const dbDir = path.resolve(DB_DIR)
    await mkdir(dbDir, { recursive: true })

    const fastaPath = path.join(dbDir, `${context.dbName}.fa`)
    const dbPath = path.join(dbDir, context.dbName)

    this.logger.log(
      `Extracting FASTA for assembly ${context.assemblyId} → ${fastaPath}`,
    )
    const refSeqs = await context.db.refSeq.findByAssembly(context.assemblyId)
    await extractAssemblyFasta(context.assemblyId, fastaPath, context.sequenceService, refSeqs)

    this.logger.log(`Running makeblastdb: dbtype=${dbType} out=${dbPath}`)
    const { stderr } = await runCommand('makeblastdb', [
      '-in',
      fastaPath,
      '-dbtype',
      dbType,
      '-out',
      dbPath,
      '-parse_seqids',
    ])
    if (stderr) {
      this.logger.log(`makeblastdb output: ${stderr}`)
    }

    await rm(fastaPath, { force: true })
    return { dbPath }
  }
}
