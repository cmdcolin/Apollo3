import { BgzipIndexedFasta, IndexedFasta } from '@gmod/indexedfasta'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { BlobFile, RemoteFile } from 'generic-filehandle2'

import { FilesService } from '../files/files.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

import type { GetSequenceDto } from './dto/get-sequence.dto.js'

@Injectable()
export class SequenceService {
  constructor(
    @Inject(FilesService) private readonly filesService: FilesService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(SequenceService.name)

  async getSequence({ end, refSeq: refSeqId, start }: GetSequenceDto) {
    const refSeq = await this.db.refSeq.findById(refSeqId)
    if (!refSeq) {
      throw new Error(`RefSeq "${refSeqId}" not found`)
    }

    const { assembly, chunkSize, name } = refSeq
    const assemblyRow = await this.db.assembly.findById(assembly)
    const source = assemblyRow?.sequenceSource

    if (source?.type === 'external' || source?.type === 'indexed') {
      const adapter = await this.buildFastaAdapter(source)
      const sequence = await adapter.getSequence(name, start, end)
      if (sequence === undefined) {
        throw new Error('Sequence not found')
      }
      return sequence
    }

    const startChunk = Math.floor(start / chunkSize)
    const endChunk = Math.floor(end / chunkSize)
    const chunks = await this.db.refSeqChunk.findByRefSeqAndRange(
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

  private async buildFastaAdapter(
    source:
      | { type: 'external'; fa: string; fai: string; gzi?: string }
      | { type: 'indexed'; fa: string; fai: string; gzi: string },
  ) {
    if (source.type === 'external') {
      if (source.gzi) {
        return new BgzipIndexedFasta({
          fasta: new RemoteFile(source.fa),
          fai: new RemoteFile(source.fai),
          gzi: new RemoteFile(source.gzi),
        })
      }
      return new IndexedFasta({
        fasta: new RemoteFile(source.fa),
        fai: new RemoteFile(source.fai),
      })
    }

    const [faRow, faiRow, gziRow] = await Promise.all([
      this.db.file.findById(source.fa),
      this.db.file.findById(source.fai),
      this.db.file.findById(source.gzi),
    ])
    if (!faRow) {
      throw new Error(`File not found: ${source.fa}`)
    }
    if (!faiRow) {
      throw new Error(`File not found: ${source.fai}`)
    }
    if (!gziRow) {
      throw new Error(`File not found: ${source.gzi}`)
    }

    const fasta = this.filesService.getFileHandle(faRow)
    const [faiDecompressed, gziDecompressed] = await Promise.all([
      this.filesService.getDecompressedFileContents(faiRow),
      this.filesService.getDecompressedFileContents(gziRow),
    ])
    const fai = new BlobFile(new Blob([faiDecompressed]))
    const gzi = new BlobFile(new Blob([gziDecompressed]))
    return new BgzipIndexedFasta({ fasta, fai, gzi })
  }
}
