import type { SequenceSource } from '@apollo-annotation/common'
import { BgzipIndexedFasta, IndexedFasta } from '@gmod/indexedfasta'
import { TwoBitFile } from '@gmod/twobit'
import { Inject, Injectable, Logger } from '@nestjs/common'
import { LocalFile, RemoteFile } from 'generic-filehandle2'

import { DatabaseService } from '../mikro-orm/database.service.js'

import type { GetSequenceDto } from './dto/get-sequence.dto.js'

function openFilehandle(pathOrUrl: string) {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return new RemoteFile(pathOrUrl)
  }
  return new LocalFile(pathOrUrl)
}

@Injectable()
export class SequenceService {
  constructor(
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(SequenceService.name)

  async getSequence({ end, refSeq: refSeqId, start }: GetSequenceDto) {
    const refSeq = await this.db.refSeq.findById(refSeqId)
    if (!refSeq) {
      throw new Error(`RefSeq "${refSeqId}" not found`)
    }

    const { assembly, name } = refSeq
    const assemblyRow = await this.db.assembly.findById(assembly)
    const source = assemblyRow?.sequenceSource
    if (!source) {
      throw new Error(`Assembly "${assembly}" has no sequence source`)
    }

    const adapter = this.buildAdapter(source)
    const sequence = await adapter.getSequence(name, start, end)
    if (sequence === undefined) {
      throw new Error('Sequence not found')
    }
    return sequence
  }

  buildAdapter(source: SequenceSource) {
    if (source.type === 'twobit') {
      return new TwoBitFile({ filehandle: openFilehandle(source.twobit) })
    }
    const fasta = openFilehandle(source.fa)
    const fai = openFilehandle(source.fai)
    if (source.gzi) {
      return new BgzipIndexedFasta({
        fasta,
        fai,
        gzi: openFilehandle(source.gzi),
      })
    }
    return new IndexedFasta({ fasta, fai })
  }
}
