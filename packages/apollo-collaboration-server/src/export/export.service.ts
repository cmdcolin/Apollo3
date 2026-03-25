import { createReadStream } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Readable } from 'node:stream'

import { assembleFeatureTrees } from '@apollo-annotation/common'
import { annotationFeatureToGFF3 } from '@apollo-annotation/shared'
import { util as gffUtil } from '@gmod/gff'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'

import { DatabaseService } from '../mikro-orm/database.service.js'
import { SequenceService } from '../sequence/sequence.service.js'

@Injectable()
export class ExportService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
    @Inject(SequenceService) private readonly sequenceService: SequenceService,
  ) {}

  private readonly logger = new Logger(ExportService.name)

  async getAssemblyName(assemblyId: string) {
    const assembly = await this.db.assembly.findById(assemblyId)
    if (!assembly) {
      throw new NotFoundException(`Assembly "${assemblyId}" not found`)
    }
    return assembly.name
  }

  async getExportID(assembly: string) {
    return { _id: `v2export:${assembly}` }
  }

  async exportGFF3(
    exportID: string,
    opts: { includeFASTA?: boolean; fastaWidth?: number },
  ): Promise<[Readable, string]> {
    if (!exportID.startsWith('v2export:')) {
      throw new NotFoundException(`Export ${exportID} not found`)
    }
    const assemblyId = exportID.slice('v2export:'.length)
    const { fastaWidth = 80, includeFASTA } = opts
    const refSeqs = await this.db.refSeq.findByAssembly(assemblyId)
    const refSeqNames = Object.fromEntries(
      refSeqs.map((rs) => [rs._id, rs.name]),
    )

    const tmpFile = path.join(tmpdir(), `apollo-export-${Date.now()}.gff3`)
    const fh = await open(tmpFile, 'w')

    await this.writeGFF3Header(fh, refSeqs)
    await this.writeGFF3Features(fh, refSeqs, refSeqNames)

    if (includeFASTA) {
      await this.writeFasta(fh, refSeqs, fastaWidth)
    }

    await fh.close()
    const resultStream = createReadStream(tmpFile)
    resultStream.on('close', () => {
      unlink(tmpFile).catch(() => {})
    })
    return [resultStream, assemblyId]
  }

  private async writeGFF3Header(
    fh: import('node:fs/promises').FileHandle,
    refSeqs: { name: string; length: number }[],
  ) {
    await fh.write('##gff-version 3\n')
    for (const refSeq of refSeqs) {
      await fh.write(`##sequence-region ${refSeq.name} 1 ${refSeq.length}\n`)
    }
  }

  private async writeGFF3Features(
    fh: import('node:fs/promises').FileHandle,
    refSeqs: { _id: string; length: number }[],
    refSeqNames: Record<string, string>,
  ) {
    for (const refSeq of refSeqs) {
      const rootFeatures = await this.db.feature.findRootsByRange(
        refSeq._id,
        0,
        refSeq.length,
      )
      if (rootFeatures.length === 0) {
        continue
      }
      const rootIds = rootFeatures.map((r) => r._id)
      const descendants = await this.db.feature.findDescendantsOfMany(rootIds)
      const trees = assembleFeatureTrees([...rootFeatures, ...descendants])
      for (const tree of trees) {
        const gff3Feature = annotationFeatureToGFF3(
          tree,
          undefined,
          refSeqNames,
        )
        await fh.write(gffUtil.formatFeature(gff3Feature))
      }
    }
  }

  private async writeFasta(
    fh: import('node:fs/promises').FileHandle,
    refSeqs: {
      _id: string
      name: string
      description?: string
      length: number
    }[],
    fastaWidth: number,
  ) {
    await fh.write('##FASTA\n')
    for (const refSeq of refSeqs) {
      const description = refSeq.description ? ` ${refSeq.description}` : ''
      await fh.write(`>${refSeq.name}${description}\n`)
      const sequence = await this.sequenceService.getSequence({
        refSeq: refSeq._id,
        start: 0,
        end: refSeq.length,
      })
      for (let i = 0; i < sequence.length; i += fastaWidth) {
        await fh.write(`${sequence.slice(i, i + fastaWidth)}\n`)
      }
    }
  }
}
