import { mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

import { Inject, Injectable, Logger } from '@nestjs/common'

import { DatabaseService } from '../../mikro-orm/database.service.js'
import { extractAssemblyFasta } from '../fasta-extract.js'
import { runCommand } from '../run-command.js'
import type { AnalysisRunner, BuildDbContext, RunContext } from '../runner.js'

const DB_DIR = process.env.BLAST_DB_DIR ?? './blast-dbs'

interface MiniprotAlignment {
  seqName: string
  source: string
  type: string
  start: number
  end: number
  score: string
  strand: string
  phase: string
  attributes: Record<string, string>
}

export function parseGff3(gff3Text: string) {
  const lines = gff3Text.split('\n')
  const alignments: MiniprotAlignment[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) {
      continue
    }
    const fields = trimmed.split('\t')
    if (fields.length < 9) {
      continue
    }
    const attrs: Record<string, string> = {}
    for (const pair of fields[8].split(';')) {
      const eq = pair.indexOf('=')
      if (eq > 0) {
        attrs[pair.slice(0, eq)] = decodeURIComponent(pair.slice(eq + 1))
      }
    }
    alignments.push({
      seqName: fields[0],
      source: fields[1],
      type: fields[2],
      start: Number(fields[3]),
      end: Number(fields[4]),
      score: fields[5],
      strand: fields[6],
      phase: fields[7],
      attributes: attrs,
    })
  }
  return alignments
}

export function groupIntoGeneModels(alignments: MiniprotAlignment[]) {
  const groups: Record<string, MiniprotAlignment[]> = {}
  for (const aln of alignments) {
    const parentId = aln.attributes.Parent ?? aln.attributes.ID ?? ''
    const key = aln.type === 'mRNA' ? (aln.attributes.ID ?? '') : parentId
    if (!key) {
      continue
    }
    if (!groups[key]) {
      groups[key] = []
    }
    groups[key].push(aln)
  }
  return Object.values(groups).map((features) => {
    const mrna = features.find((f) => f.type === 'mRNA')
    const cds = features.filter((f) => f.type === 'CDS')
    return {
      seqName: mrna?.seqName ?? cds[0]?.seqName ?? '',
      start: mrna?.start ?? Math.min(...cds.map((c) => c.start)),
      end: mrna?.end ?? Math.max(...cds.map((c) => c.end)),
      strand: mrna?.strand ?? cds[0]?.strand ?? '.',
      identity: mrna?.attributes.Identity ?? '',
      target: mrna?.attributes.Target ?? '',
      exonCount: cds.length,
    }
  })
}

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
    await extractAssemblyFasta(context.assemblyId, fastaPath, context.sequenceService, refSeqs)

    this.logger.log(`Running miniprot -d → ${indexPath}`)
    await runCommand('miniprot', ['-d', indexPath, fastaPath])

    await rm(fastaPath, { force: true })
    return { dbPath: indexPath }
  }
}
