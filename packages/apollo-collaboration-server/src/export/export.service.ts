import { createReadStream } from 'node:fs'
import { type FileHandle, open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { Readable } from 'node:stream'

import { assembleFeatureTrees } from '@apollo-annotation/common'
import { annotationFeatureToGFF3 } from '@apollo-annotation/shared'
import { util as gffUtil } from '@gmod/gff'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'

import { readSequencesFromSource } from '../assemblies/assemblies.service.js'
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

  getExportID(assembly: string) {
    return { _id: `v2export:${assembly}` }
  }

  async exportGFF3(
    exportID: string,
    opts: { includeFASTA?: boolean; fastaWidth?: number },
  ): Promise<[Readable, string]> {
    if (!exportID.startsWith('v2export:')) {
      throw new NotFoundException(`Export ${exportID} not found`)
    }
    const assemblyName = exportID.slice('v2export:'.length)
    const assembly = await this.db.assembly.findByName(assemblyName)
    if (!assembly) {
      throw new NotFoundException(`Assembly "${assemblyName}" not found`)
    }
    const assemblyId = assembly._id
    const { fastaWidth = 80, includeFASTA } = opts
    if (!assembly.sequenceSource) {
      throw new NotFoundException(`Assembly "${assemblyName}" has no sequence source`)
    }
    const refSeqs = await readSequencesFromSource(assembly.sequenceSource)

    const tmpFile = path.join(tmpdir(), `apollo-export-${Date.now()}.gff3`)
    const fh = await open(tmpFile, 'w')

    await this.writeGFF3Header(fh, refSeqs)
    await this.writeGFF3Features(fh, assemblyId, refSeqs)

    if (includeFASTA) {
      await this.writeFasta(fh, assemblyName, refSeqs, fastaWidth)
    }

    await fh.close()
    const resultStream = createReadStream(tmpFile)
    resultStream.on('close', () => {
      unlink(tmpFile).catch(() => {
        /* ignore cleanup errors */
      })
    })
    return [resultStream, assemblyId]
  }

  private async writeGFF3Header(
    fh: FileHandle,
    refSeqs: { name: string; length: number }[],
  ) {
    await fh.write('##gff-version 3\n')
    for (const refSeq of refSeqs) {
      await fh.write(`##sequence-region ${refSeq.name} 1 ${refSeq.length}\n`)
    }
  }

  private async writeGFF3Features(
    fh: FileHandle,
    assemblyId: string,
    refSeqs: { name: string; length: number }[],
  ) {
    for (const refSeq of refSeqs) {
      const rootFeatures = await this.db.feature.findRootsByRange(
        assemblyId,
        refSeq.name,
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
        const gff3Feature = annotationFeatureToGFF3(tree)
        await fh.write(gffUtil.formatFeature(gff3Feature))
      }
    }
  }

  private async writeFasta(
    fh: FileHandle,
    assemblyName: string,
    refSeqs: { name: string; length: number }[],
    fastaWidth: number,
  ) {
    await fh.write('##FASTA\n')
    for (const refSeq of refSeqs) {
      await fh.write(`>${refSeq.name}\n`)
      const sequence = await this.sequenceService.getSequence({
        assembly: assemblyName,
        refSeq: refSeq.name,
        start: 0,
        end: refSeq.length,
      })
      for (let i = 0; i < sequence.length; i += fastaWidth) {
        await fh.write(`${sequence.slice(i, i + fastaWidth)}\n`)
      }
    }
  }
}
