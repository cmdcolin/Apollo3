/* eslint-disable @typescript-eslint/no-unsafe-return */
import { createReadStream } from 'node:fs'
import { open, unlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { ReadableStream, TransformStream } from 'node:stream/web'

import type { FeatureRow } from '@apollo-annotation/common'
import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'
import {
  Assembly,
  AssemblyDocument,
  Export,
  ExportDocument,
  Feature,
  FeatureDocument,
  File,
  FileDocument,
  RefSeq,
  RefSeqChunk,
  RefSeqDocument,
} from '@apollo-annotation/schemas'
import {
  annotationFeatureToGFF3,
  splitStringIntoChunks,
} from '@apollo-annotation/shared'
import { GFFFormattingTransformer, util as gffUtil } from '@gmod/gff'
import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { FilterQuery, Model } from 'mongoose'
import StreamConcat from 'stream-concat'

import { DatabaseService } from '../mikro-orm/database.service'

import {
  FeatureDocToGFF3FeatureStream,
  RefSeqChunkDocToFASTAStream,
  RefSeqDocToGFF3HeaderStream,
} from './transforms'

function featureRowToSnapshot(
  root: FeatureRow,
  allRows: FeatureRow[],
): AnnotationFeatureSnapshot {
  const childRows = allRows.filter((r) => r.parentId === root._id)
  const children: Record<string, AnnotationFeatureSnapshot> | undefined =
    childRows.length > 0
      ? Object.fromEntries(
          childRows.map((child) => [
            child._id,
            featureRowToSnapshot(child, allRows),
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

@Injectable()
export class ExportService {
  constructor(
    @Optional()
    @InjectModel(Assembly.name)
    private readonly assemblyModel: Model<AssemblyDocument>,
    @Optional()
    @InjectModel(Export.name)
    private readonly exportModel: Model<ExportDocument>,
    @Optional()
    @InjectModel(Feature.name)
    private readonly featureModel: Model<FeatureDocument>,
    @Optional()
    @InjectModel(File.name)
    private readonly fileModel: Model<FileDocument>,
    @Optional()
    @InjectModel(RefSeq.name)
    private readonly refSeqModel: Model<RefSeqDocument>,
    @Optional()
    @InjectModel(RefSeqChunk.name)
    private readonly refSeqChunksModel: Model<RefSeqDocument>,
    private readonly configService: ConfigService<
      { FILE_UPLOAD_FOLDER: string },
      true
    >,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(ExportService.name)

  async getAssemblyName(assemblyId: string) {
    if (this.db.useV2Backend) {
      const assembly = await this.db.assembly.findById(assemblyId)
      if (!assembly) {
        throw new NotFoundException()
      }
      return assembly.name
    }
    const assemblyDoc = await this.assemblyModel.findById(assemblyId)
    if (!assemblyDoc) {
      throw new NotFoundException()
    }
    return assemblyDoc.name
  }

  async getExportID(assembly: string) {
    if (this.db.useV2Backend) {
      // Encode assembly ID in the export ID so we can retrieve it without a DB lookup
      return { _id: `v2export:${assembly}` }
    }
    return this.exportModel.create({ assembly })
  }

  async exportGFF3(
    exportID: string,
    opts: { includeFASTA?: boolean; fastaWidth?: number },
  ): Promise<[Readable, string]> {
    if (this.db.useV2Backend) {
      return this.exportGFF3V2(exportID, opts)
    }
    const exportDoc = await this.exportModel.findById(exportID)
    if (!exportDoc) {
      throw new NotFoundException()
    }
    const { fastaWidth, includeFASTA } = opts
    const { assembly } = exportDoc
    const refSeqs = await this.refSeqModel.find({ assembly }).exec()
    const refSeqIds = refSeqs.map((refSeq) => refSeq._id)

    const headerStream = Readable.toWeb(
      this.refSeqModel.find({ assembly }).cursor(),
    ).pipeThrough(new RefSeqDocToGFF3HeaderStream())

    const query = { refSeq: { $in: refSeqIds } }
    const featureStream = Readable.toWeb(
      // unicorn thinks this is an Array.prototype.find, so we ignore it
      // eslint-disable-next-line unicorn/no-array-callback-reference
      this.featureModel.find(query).cursor(),
    )
      .pipeThrough(new FeatureDocToGFF3FeatureStream(refSeqs))
      .pipeThrough(
        new TransformStream(
          new GFFFormattingTransformer({ insertVersionDirective: false }),
        ),
      )

    let sequenceStreams: ReadableStream<string>[] = []
    if (includeFASTA) {
      const assemblyDoc = await this.assemblyModel.findById(assembly.toString())
      if (!assemblyDoc) {
        throw new Error(
          `Error getting document for assembly ${assembly.toString()}`,
        )
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (assemblyDoc?.fileIds?.fai) {
        sequenceStreams = await this.streamFromLocalFasta(
          assemblyDoc.fileIds.fa,
        )
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      } else if (assemblyDoc.externalLocation) {
        sequenceStreams = await this.streamFromRemoteFasta(
          assemblyDoc.externalLocation.fa,
        )
      } else {
        sequenceStreams = this.streamFromRefSeqCollection(query, fastaWidth)
      }
    }
    const streams = [headerStream, featureStream, ...sequenceStreams]
    const combinedStream: Readable = new StreamConcat(
      streams.map((stream) => Readable.fromWeb(stream)),
    )
    return [combinedStream, assembly.toString()]
  }

  private async exportGFF3V2(
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

    // Write incrementally to a temp file to keep memory low
    const tmpFile = path.join(tmpdir(), `apollo-export-${Date.now()}.gff3`)
    const fh = await open(tmpFile, 'w')

    // GFF3 header
    await fh.write('##gff-version 3\n')
    for (const refSeq of refSeqs) {
      await fh.write(`##sequence-region ${refSeq.name} 1 ${refSeq.length}\n`)
    }

    // Features: process one refSeq at a time
    for (const refSeq of refSeqs) {
      const rootFeatures = await this.db.feature.findRootsByRange(
        refSeq._id,
        0,
        refSeq.length,
      )
      for (const root of rootFeatures) {
        const descendants = await this.db.feature.findDescendants(root._id)
        const allRows = [root, ...descendants]
        const snapshot = featureRowToSnapshot(root, allRows)
        const gff3Feature = annotationFeatureToGFF3(
          snapshot,
          undefined,
          refSeqNames,
        )
        const formatted = gffUtil.formatFeature(gff3Feature)
        await fh.write(formatted)
      }
    }

    // FASTA section
    if (includeFASTA) {
      const assemblyRow = await this.db.assembly.findById(assemblyIdStr)
      if (assemblyRow?.fileIds && 'fai' in assemblyRow.fileIds) {
        await fh.close()
        // For local fasta, append the decompressed fasta to the file
        const fastaStreams = await this.streamFromLocalFasta(
          assemblyRow.fileIds.fa,
        )
        const combined = new StreamConcat([
          createReadStream(tmpFile),
          ...fastaStreams.map((s) => Readable.fromWeb(s)),
        ])
        return [combined, assemblyIdStr]
      }
      if (assemblyRow?.externalLocation) {
        await fh.close()
        const fastaStreams = await this.streamFromRemoteFasta(
          assemblyRow.externalLocation.fa,
        )
        const combined = new StreamConcat([
          createReadStream(tmpFile),
          ...fastaStreams.map((s) => Readable.fromWeb(s)),
        ])
        return [combined, assemblyIdStr]
      }
      // Write FASTA from refSeq chunks
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
    const faDoc = await this.fileModel.findById(fastaFileId)
    if (!faDoc) {
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
      createReadStream(path.join(fileUploadFolder, faDoc.checksum)),
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

  streamFromRefSeqCollection(
    query: FilterQuery<RefSeqDocument>,
    fastaWidth?: number,
  ): ReadableStream<string>[] {
    const sequenceStream = Readable.toWeb(
      this.refSeqChunksModel
        // unicorn thinks this is an Array.prototype.find, so we ignore it
        // eslint-disable-next-line unicorn/no-array-callback-reference
        .find(query)
        .sort({ refSeq: 1, n: 1 })
        .populate('refSeq')
        .cursor(),
    ).pipeThrough(new RefSeqChunkDocToFASTAStream({ fastaWidth }))
    return [sequenceStream]
  }
}
