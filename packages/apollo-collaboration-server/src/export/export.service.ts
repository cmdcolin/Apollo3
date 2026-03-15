import { createReadStream } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { ReadableStream } from 'node:stream/web'

import type { FeatureRow } from '@apollo-annotation/common'
import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'
import {
  annotationFeatureToGFF3,
  splitStringIntoChunks,
} from '@apollo-annotation/shared'
import { util as gffUtil } from '@gmod/gff'
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import StreamConcat from 'stream-concat'

import { DatabaseService } from '../mikro-orm/database.service.js'

function featureRowToSnapshot(
  root: FeatureRow,
  childrenMap: Map<string, FeatureRow[]>,
): AnnotationFeatureSnapshot {
  const childRows = childrenMap.get(root._id)
  const children: Record<string, AnnotationFeatureSnapshot> | undefined =
    childRows && childRows.length > 0
      ? Object.fromEntries(
          childRows.map((child) => [
            child._id,
            featureRowToSnapshot(child, childrenMap),
          ]),
        )
      : undefined
  return {
    _id: root._id,
    refSeq: root.refSeq,
    type: root.type,
    min: root.min,
    max: root.max,
    strand: root.strand,
    attributes: root.attributes ?? {},
    children,
  } as AnnotationFeatureSnapshot
}

function buildChildrenMap(rows: FeatureRow[]) {
  const map = new Map<string, FeatureRow[]>()
  for (const row of rows) {
    if (row.parentId) {
      const siblings = map.get(row.parentId)
      if (siblings) {
        siblings.push(row)
      } else {
        map.set(row.parentId, [row])
      }
    }
  }
  return map
}

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
      throw new NotFoundException()
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
    const assemblyIdStr = exportID.slice('v2export:'.length)

    const { fastaWidth = 80, includeFASTA } = opts
    const refSeqs = await this.db.refSeq.findByAssembly(assemblyIdStr)
    const refSeqNames = Object.fromEntries(
      refSeqs.map((rs) => [rs._id, rs.name]),
    )

    const tmpFile = path.join(tmpdir(), `apollo-export-${Date.now()}.gff3`)
    const fh = await open(tmpFile, 'w')

    await fh.write('##gff-version 3\n')
    for (const refSeq of refSeqs) {
      await fh.write(`##sequence-region ${refSeq.name} 1 ${refSeq.length}\n`)
    }

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
      const childrenMap = buildChildrenMap([...rootFeatures, ...descendants])
      for (const root of rootFeatures) {
        const snapshot = featureRowToSnapshot(root, childrenMap)
        const gff3Feature = annotationFeatureToGFF3(
          snapshot,
          undefined,
          refSeqNames,
        )
        const formatted = gffUtil.formatFeature(gff3Feature)
        await fh.write(formatted)
      }
    }

    if (includeFASTA) {
      const assemblyRow = await this.db.assembly.findById(assemblyIdStr)
      const source = assemblyRow?.sequenceSource
      if (source?.type === 'indexed') {
        await fh.close()
        const fastaStreams = await this.streamFromLocalFasta(source.fa)
        const combined = new StreamConcat([
          createReadStream(tmpFile),
          ...fastaStreams.map((s) => Readable.fromWeb(s)),
        ])
        return [combined, assemblyIdStr]
      }
      if (source?.type === 'external') {
        await fh.close()
        const fastaStreams = await this.streamFromRemoteFasta(source.fa)
        const combined = new StreamConcat([
          createReadStream(tmpFile),
          ...fastaStreams.map((s) => Readable.fromWeb(s)),
        ])
        return [combined, assemblyIdStr]
      }
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

    await fh.close()
    const resultStream = createReadStream(tmpFile)
    resultStream.on('close', () => {
      unlink(tmpFile).catch(() => {})
    })
    return [resultStream, assemblyIdStr]
  }

  async streamFromLocalFasta(
    fastaFileId: string,
  ): Promise<ReadableStream<string>[]> {
    const faRow = await this.db.file.findById(fastaFileId)
    if (!faRow) {
      throw new Error('Undefined document')
    }
    const fastaLineStream = new ReadableStream({
      start(controller) {
        controller.enqueue('##FASTA\n')
        controller.close()
      },
    })

    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })
    const fileStream = Readable.toWeb(
      createReadStream(path.join(fileUploadFolder, faRow.checksum)),
    )
    const gunzip = new DecompressionStream('gzip')
    return [fastaLineStream, fileStream.pipeThrough(gunzip)]
  }

  async streamFromRemoteFasta(
    fastaUrl: string,
  ): Promise<ReadableStream<string>[]> {
    const fastaLineStream = new ReadableStream({
      start(controller) {
        controller.enqueue('##FASTA\n')
        controller.close()
      },
    })

    const response = await fetch(fastaUrl)
    if (response.body === null) {
      throw new Error(`No body in response from ${fastaUrl}`)
    }

    const gunzip = new DecompressionStream('gzip')
    return [fastaLineStream, response.body.pipeThrough(gunzip)]
  }
}
