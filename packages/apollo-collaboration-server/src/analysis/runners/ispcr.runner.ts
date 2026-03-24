import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../../mikro-orm/database.service.js'
import { extractAssemblyFasta } from '../fasta-extract.js'
import { runCommand } from '../run-command.js'
import type { AnalysisRunner, BuildDbContext, RunContext } from '../runner.js'

const DB_DIR = process.env.BLAST_DB_DIR ?? './blast-dbs'

export interface IsPcrProduct {
  seqName: string
  start: number
  end: number
  strand: string
  size: number
  sequence: string
}

function parseIsPcrFasta(output: string): IsPcrProduct[] {
  const products: IsPcrProduct[] = []
  const lines = output.split('\n')
  let current: Partial<IsPcrProduct> | null = null
  const seqLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('>')) {
      if (current?.seqName !== undefined) {
        current.sequence = seqLines.join('')
        products.push(current as IsPcrProduct)
        seqLines.length = 0
      }
      current = null
      // Header format: >seqName:start+end size
      // strand is indicated by + (forward) or - (reverse) between start and end
      const m = /^>(\S+):(\d+)([+-])(\d+)\s+(\d+)/.exec(line)
      if (m) {
        current = {
          seqName: m[1],
          start: Number(m[2]),
          end: Number(m[4]),
          strand: m[3],
          size: Number(m[5]),
        }
      }
    } else if (current) {
      seqLines.push(line.trim())
    }
  }
  if (current?.seqName !== undefined) {
    current.sequence = seqLines.join('')
    products.push(current as IsPcrProduct)
  }
  return products
}

@Injectable()
export class IsPcrRunner implements AnalysisRunner {
  readonly tool = 'ispcr'

  constructor(@Inject(DatabaseService) private readonly db: DatabaseService) {}

  private readonly logger = new Logger(IsPcrRunner.name)

  async isInstalled() {
    try {
      await runCommand('isPcr', [])
      return true
    } catch (error) {
      const msg = error instanceof Error ? error.message : ''
      // isPcr with no args prints usage and exits non-zero
      if (msg.includes('isPcr') || msg.includes('usage')) {
        return true
      }
      return false
    }
  }

  async run(context: RunContext) {
    const forwardPrimer = String(context.job.params.forwardPrimer ?? '')
    const reversePrimer = String(context.job.params.reversePrimer ?? '')
    const maxSize = Number(context.job.params.maxSize ?? 4000)
    const databaseId = String(context.job.params.databaseId ?? '')

    const analysisDb = await context.db.analysisDb.findById(databaseId)
    if (!analysisDb?.dbPath) {
      throw new Error(
        `Analysis database "${databaseId}" not found or not built`,
      )
    }

    this.logger.log(
      `isPCR: fwd=${forwardPrimer} rev=${reversePrimer} maxSize=${maxSize} db=${analysisDb.dbPath}`,
    )

    const { stdout } = await runCommand(
      'isPcr',
      [
        analysisDb.dbPath,
        forwardPrimer,
        reversePrimer,
        'stdout',
        `-maxSize=${maxSize}`,
        '-out=fa',
      ],
      context.signal,
    )

    return { products: parseIsPcrFasta(stdout) }
  }

  async buildDb(context: BuildDbContext) {
    const dbDir = path.resolve(DB_DIR)
    await mkdir(dbDir, { recursive: true })

    const fastaPath = path.join(dbDir, `${context.dbName}.fa`)
    const twoBitPath = path.join(dbDir, `${context.dbName}.2bit`)

    this.logger.log(
      `Extracting FASTA for assembly ${context.assemblyId} → ${fastaPath}`,
    )
    const refSeqs = await context.db.refSeq.findByAssembly(context.assemblyId)
    await extractAssemblyFasta(context.assemblyId, fastaPath, context.sequenceService, refSeqs)

    this.logger.log(`Running faToTwoBit → ${twoBitPath}`)
    await runCommand('faToTwoBit', [fastaPath, twoBitPath])

    await rm(fastaPath, { force: true })
    return { dbPath: twoBitPath }
  }
}
