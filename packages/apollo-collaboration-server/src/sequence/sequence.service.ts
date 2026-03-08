/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-base-to-string */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
import {
  File,
  FileDocument,
  RefSeq,
  RefSeqChunk,
  RefSeqChunkDocument,
  RefSeqDocument,
} from '@apollo-annotation/schemas'
import { BgzipIndexedFasta, IndexedFasta } from '@gmod/indexedfasta'
import { Injectable, Logger, Optional } from '@nestjs/common'
import { InjectModel } from '@nestjs/mongoose'
import { RemoteFile } from 'generic-filehandle'
import { Model } from 'mongoose'

import { AssembliesService } from '../assemblies/assemblies.service'
import { FilesService } from '../files/files.service'
import { DatabaseService } from '../mikro-orm/database.service'

import { GetSequenceDto } from './dto/get-sequence.dto'

@Injectable()
export class SequenceService {
  constructor(
    @Optional()
    @InjectModel(File.name)
    private readonly fileModel: Model<FileDocument>,
    private readonly filesService: FilesService,
    @Optional()
    @InjectModel(RefSeqChunk.name)
    private readonly refSeqChunkModel: Model<RefSeqChunkDocument>,
    @Optional()
    @InjectModel(RefSeq.name)
    private readonly refSeqModel: Model<RefSeqDocument>,
    private readonly assembliesService: AssembliesService,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(SequenceService.name)

  async getSequence({ end, refSeq: refSeqId, start }: GetSequenceDto) {
    if (this.db.useV2Backend) {
      return this.getSequenceV2({ end, refSeq: refSeqId, start })
    }

    const refSeq = await this.refSeqModel.findById(refSeqId)
    if (!refSeq) {
      throw new Error(`RefSeq "${refSeqId}" not found`)
    }

    const { assembly, chunkSize, name } = refSeq
    const assemblyDoc = await this.assembliesService.findOne(
      assembly.toString(),
    )

    if (assemblyDoc?.externalLocation) {
      const { fa, fai, gzi } = assemblyDoc.externalLocation

      const sequenceAdapter = gzi
        ? new BgzipIndexedFasta({
            fasta: new RemoteFile(fa, { fetch }),
            fai: new RemoteFile(fai, { fetch }),
            gzi: new RemoteFile(gzi, { fetch }),
          })
        : new IndexedFasta({
            fasta: new RemoteFile(fa, { fetch }),
            fai: new RemoteFile(fai, { fetch }),
          })
      const sequence = await sequenceAdapter.getSequence(name, start, end)
      if (sequence === undefined) {
        throw new Error('Sequence not found')
      }
      return sequence
    }

    if (assemblyDoc?.fileIds && 'fai' in assemblyDoc.fileIds) {
      const { fa: faId, fai: faiId, gzi: gziId } = assemblyDoc.fileIds
      const faDoc = await this.fileModel.findById(faId)
      if (!faDoc) {
        throw new Error(`No checksum for file document ${faId}`)
      }

      const faiDoc = await this.fileModel.findById(faiId)
      if (!faiDoc) {
        throw new Error(`File document not found for ${faiId}`)
      }

      const gziDoc = await this.fileModel.findById(gziId)
      if (!gziDoc) {
        throw new Error(`File document not found for ${gziId}`)
      }

      const fasta = this.filesService.getFileHandle(faDoc)
      const fai = this.filesService.getFileHandle(faiDoc)
      const gzi = gziId ? this.filesService.getFileHandle(gziDoc) : undefined
      const sequenceAdapter = gziId
        ? new BgzipIndexedFasta({ fasta, fai, gzi })
        : new IndexedFasta({ fasta, fai })
      const sequence = await sequenceAdapter.getSequence(name, start, end)
      await Promise.all([fasta.close(), fai.close(), gzi?.close()])
      if (sequence === undefined) {
        throw new Error('Sequence not found')
      }
      return sequence
    }

    const startChunk = Math.floor(start / chunkSize)
    const endChunk = Math.floor(end / chunkSize)
    const seq: string[] = []
    for await (const refSeqChunk of this.refSeqChunkModel
      .find({
        refSeq,
        $and: [{ n: { $gte: startChunk } }, { n: { $lte: endChunk } }],
      })
      .sort({ n: 1 })) {
      const { n, sequence } = refSeqChunk
      if (n === startChunk || n === endChunk) {
        seq.push(
          sequence.slice(
            n === startChunk ? start - n * chunkSize : undefined,
            n === endChunk ? end - n * chunkSize : undefined,
          ),
        )
      } else {
        seq.push(sequence)
      }
    }
    return seq.join('')
  }

  private async getSequenceV2({
    end,
    refSeq: refSeqId,
    start,
  }: GetSequenceDto) {
    const {
      assembly: assemblyRepository,
      file: fileRepository,
      refSeqChunk: refSeqChunkRepository,
      refSeq: refSeqRepository,
    } = this.db

    const refSeq = await refSeqRepository.findById(refSeqId)
    if (!refSeq) {
      throw new Error(`RefSeq "${refSeqId}" not found`)
    }

    const { assembly, chunkSize, name } = refSeq
    const assemblyRow = await assemblyRepository.findById(assembly)

    if (assemblyRow?.externalLocation) {
      const { fa, fai, gzi } = assemblyRow.externalLocation

      const sequenceAdapter = gzi
        ? new BgzipIndexedFasta({
            fasta: new RemoteFile(fa, { fetch }),
            fai: new RemoteFile(fai, { fetch }),
            gzi: new RemoteFile(gzi, { fetch }),
          })
        : new IndexedFasta({
            fasta: new RemoteFile(fa, { fetch }),
            fai: new RemoteFile(fai, { fetch }),
          })
      const sequence = await sequenceAdapter.getSequence(name, start, end)
      if (sequence === undefined) {
        throw new Error('Sequence not found')
      }
      return sequence
    }

    if (assemblyRow?.fileIds && 'fai' in assemblyRow.fileIds) {
      const { fa: faId, fai: faiId, gzi: gziId } = assemblyRow.fileIds
      const faRow = await fileRepository.findById(faId)
      if (!faRow) {
        throw new Error(`No checksum for file document ${faId}`)
      }

      const faiRow = await fileRepository.findById(faiId)
      if (!faiRow) {
        throw new Error(`File document not found for ${faiId}`)
      }

      const gziRow = await fileRepository.findById(gziId)
      if (!gziRow) {
        throw new Error(`File document not found for ${gziId}`)
      }

      const fasta = this.filesService.getFileHandle(faRow)
      const fai = this.filesService.getFileHandle(faiRow)
      const gzi = gziId ? this.filesService.getFileHandle(gziRow) : undefined
      const sequenceAdapter = gziId
        ? new BgzipIndexedFasta({ fasta, fai, gzi })
        : new IndexedFasta({ fasta, fai })
      const sequence = await sequenceAdapter.getSequence(name, start, end)
      await Promise.all([fasta.close(), fai.close(), gzi?.close()])
      if (sequence === undefined) {
        throw new Error('Sequence not found')
      }
      return sequence
    }

    const startChunk = Math.floor(start / chunkSize)
    const endChunk = Math.floor(end / chunkSize)
    const chunks = await refSeqChunkRepository.findByRefSeqAndRange(
      refSeqId,
      startChunk,
      endChunk,
    )
    const seq: string[] = []
    for (const chunk of chunks) {
      const { n, sequence } = chunk
      if (n === startChunk || n === endChunk) {
        seq.push(
          sequence.slice(
            n === startChunk ? start - n * chunkSize : undefined,
            n === endChunk ? end - n * chunkSize : undefined,
          ),
        )
      } else {
        seq.push(sequence)
      }
    }
    return seq.join('')
  }
}
