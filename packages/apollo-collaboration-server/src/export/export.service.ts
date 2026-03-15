import { createReadStream } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'

import { assembleFeatureTrees } from '@apollo-annotation/common'
import {
  annotationFeatureToGFF3,
  splitStringIntoChunks,
} from '@apollo-annotation/shared'
import { util as gffUtil } from '@gmod/gff'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import StreamConcat from 'stream-concat'

import { DatabaseService } from '../mikro-orm/database.service.js'

@Injectable()
export class ExportService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<
      { FILE_UPLOAD_FOLDER: string },
      true
    >,
    @Inject(DatabaseService) private readonly db: DatabaseService,
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
      const fastaStream = await this.buildFastaStream(assemblyId)
      if (fastaStream) {
        await fh.close()
        const combined = new StreamConcat([
          createReadStream(tmpFile),
          ...fastaStream.map((s) => Readable.fromWeb(s)),
        ])
        return [combined, assemblyId]
      }
      await this.writeChunkedFasta(fh, refSeqs, fastaWidth)
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

  private async buildFastaStream(
    assemblyId: string,
  ): Promise<ReadableStream<string>[] | undefined> {
    const assemblyRow = await this.db.assembly.findById(assemblyId)
    const source = assemblyRow?.sequenceSource
    if (source?.type === 'indexed') {
      return this.streamFasta(await this.getLocalFastaStream(source.fa))
    }
    if (source?.type === 'external') {
      return this.streamFasta(await this.getRemoteFastaStream(source.fa))
    }
    return undefined
  }

  private streamFasta(fastaBody: ReadableStream): ReadableStream<string>[] {
    const header = new ReadableStream({
      start(controller) {
        controller.enqueue('##FASTA\n')
        controller.close()
      },
    })
    const gunzip = new DecompressionStream('gzip')
    return [header, fastaBody.pipeThrough(gunzip)]
  }

  private async getLocalFastaStream(fastaFileId: string) {
    const faRow = await this.db.file.findById(fastaFileId)
    if (!faRow) {
      throw new NotFoundException(`FASTA file "${fastaFileId}" not found`)
    }
    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })
    return Readable.toWeb(
      createReadStream(path.join(fileUploadFolder, faRow.checksum)),
    )
  }

  private async getRemoteFastaStream(fastaUrl: string) {
    const response = await fetch(fastaUrl)
    if (response.body === null) {
      throw new Error(`No body in response from ${fastaUrl}`)
    }
    return response.body
  }

  private async writeChunkedFasta(
    fh: import('node:fs/promises').FileHandle,
    refSeqs: {
      _id: string
      name: string
      description?: string
      length: number
      chunkSize: number
    }[],
    fastaWidth: number,
  ) {
    await fh.write('##FASTA\n')
    for (const refSeq of refSeqs) {
      const description = refSeq.description ? ` ${refSeq.description}` : ''
      await fh.write(`>${refSeq.name}${description}\n`)
      const chunks = await this.db.refSeqChunk.findByRefSeqAndRange(
        refSeq._id,
        0,
        Math.ceil(refSeq.length / refSeq.chunkSize),
      )
      let lineBuffer = ''
      for (const chunk of chunks) {
        let { sequence } = chunk
        if (lineBuffer) {
          const needed = fastaWidth - lineBuffer.length
          lineBuffer += sequence.slice(0, needed)
          sequence = sequence.slice(needed)
          if (lineBuffer.length === fastaWidth) {
            await fh.write(`${lineBuffer}\n`)
            lineBuffer = ''
          } else {
            continue
          }
        }
        const seqLines = splitStringIntoChunks(sequence, fastaWidth)
        const lastLine = seqLines.at(-1) ?? ''
        if (lastLine.length > 0 && lastLine.length !== fastaWidth) {
          lineBuffer = seqLines.pop() ?? ''
        }
        if (seqLines.length > 0) {
          await fh.write(`${seqLines.join('\n')}\n`)
        }
      }
      if (lineBuffer) {
        await fh.write(`${lineBuffer}\n`)
      }
    }
  }
}
