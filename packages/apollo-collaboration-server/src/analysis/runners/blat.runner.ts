import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../../mikro-orm/database.service.js'
import { extractAssemblyFasta } from '../fasta-extract.js'
import { runCommand } from '../run-command.js'
import type { AnalysisRunner, BuildDbContext, RunContext } from '../runner.js'

const DB_DIR = process.env.BLAST_DB_DIR ?? './blast-dbs'

interface PslHit {
  matches: number
  misMatches: number
  qName: string
  qSize: number
  qStart: number
  qEnd: number
  tName: string
  tSize: number
  tStart: number
  tEnd: number
  strand: string
  blockCount: number
  blockSizes: number[]
  qStarts: number[]
  tStarts: number[]
  identity: number
  score: number
}

function parsePsl(pslText: string) {
  const lines = pslText.split('\n')
  const hits: PslHit[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('-') || trimmed.startsWith('match')) {
      continue
    }
    const fields = trimmed.split('\t')
    if (fields.length < 21) {
      continue
    }
    const matches = Number(fields[0])
    const misMatches = Number(fields[1])
    const alignLen = matches + misMatches
    hits.push({
      matches,
      misMatches,
      qName: fields[9],
      qSize: Number(fields[10]),
      qStart: Number(fields[11]),
      qEnd: Number(fields[12]),
      tName: fields[13],
      tSize: Number(fields[14]),
      tStart: Number(fields[15]),
      tEnd: Number(fields[16]),
      strand: fields[8],
      blockCount: Number(fields[17]),
      blockSizes: fields[18].split(',').filter(Boolean).map(Number),
      qStarts: fields[19].split(',').filter(Boolean).map(Number),
      tStarts: fields[20].split(',').filter(Boolean).map(Number),
      identity: alignLen > 0 ? (matches / alignLen) * 100 : 0,
      score: matches - misMatches,
    })
  }
  hits.sort((a, b) => b.score - a.score)
  return hits
}

@Injectable()
export class BlatRunner implements AnalysisRunner {
  readonly tool = 'blat'

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private readonly logger = new Logger(BlatRunner.name)

  async isInstalled() {
    try {
      await runCommand('blat', [])
      return true
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      // blat with no args prints usage and exits non-zero
      if (msg.includes('blat')) {
        return true
      }
      return false
    }
  }

  async run(context: RunContext) {
    const query = String(context.job.params.query ?? '')
    const databaseId = String(context.job.params.databaseId ?? '')
    const queryType = String(context.job.params.queryType ?? 'dna')

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
    const tmpOut = `${tmpQuery}.psl`
    await writeFile(tmpQuery, query)

    try {
      const args = ['-noHead']
      if (queryType === 'protein') {
        args.push('-q=prot', '-t=dnax')
      }
      args.push(analysisDb.dbPath, tmpQuery, tmpOut)

      await runCommand('blat', args, context.signal)

      const pslText = await readFile(tmpOut, 'utf8')
      return { hits: parsePsl(pslText) }
    } finally {
      await rm(tmpQuery, { force: true })
      await rm(tmpOut, { force: true })
    }
  }

  async buildDb(context: BuildDbContext) {
    const dbDir = path.resolve(DB_DIR)
    await mkdir(dbDir, { recursive: true })

    const fastaPath = path.join(dbDir, `${context.dbName}.fa`)
    const twoBitPath = path.join(dbDir, `${context.dbName}.2bit`)

    this.logger.log(
      `Extracting FASTA for assembly ${context.assemblyId} → ${fastaPath}`,
    )
    await extractAssemblyFasta(context.assemblyId, fastaPath, context.db)

    this.logger.log(`Running faToTwoBit → ${twoBitPath}`)
    await runCommand('faToTwoBit', [fastaPath, twoBitPath])

    await rm(fastaPath, { force: true })
    return { dbPath: twoBitPath }
  }
}
