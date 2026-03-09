import { BgzipIndexedFasta, IndexedFasta } from '@gmod/indexedfasta'
import { Injectable, Logger } from '@nestjs/common'
import { RemoteFile } from 'generic-filehandle2'

import { FilesService } from '../files/files.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

import { GetSequenceDto } from './dto/get-sequence.dto.js'

@Injectable()
export class SequenceService {
  constructor(
    private readonly filesService: FilesService,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(SequenceService.name)

  async getSequence({ end, refSeq: refSeqId, start }: GetSequenceDto) {
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
