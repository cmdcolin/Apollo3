import { open } from 'node:fs/promises'

import { splitStringIntoChunks } from '@apollo-annotation/shared'

import type { SequenceService } from '../sequence/sequence.service.js'

export async function extractAssemblyFasta(
  assemblyId: string,
  outputPath: string,
  sequenceService: SequenceService,
  refSeqs: { _id: string; name: string; description?: string; length: number }[],
) {
  if (refSeqs.length === 0) {
    throw new Error(`Assembly "${assemblyId}" has no reference sequences`)
  }

  const fh = await open(outputPath, 'w')
  try {
    for (const refSeq of refSeqs) {
      const description = refSeq.description ? ` ${refSeq.description}` : ''
      await fh.write(`>${refSeq.name}${description}\n`)
      const sequence = await sequenceService.getSequence({
        refSeq: refSeq._id,
        start: 0,
        end: refSeq.length,
      })
      const lines = splitStringIntoChunks(sequence, 80)
      for (const line of lines) {
        await fh.write(`${line}\n`)
      }
    }
  } finally {
    await fh.close()
  }
}
