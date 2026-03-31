import { open } from 'node:fs/promises'

import { splitStringIntoChunks } from '@apollo-annotation/shared'

import type { SequenceService } from '../sequence/sequence.service.js'

export async function extractAssemblyFasta(
  assemblyName: string,
  outputPath: string,
  sequenceService: SequenceService,
  refSeqs: { name: string; length: number }[],
) {
  if (refSeqs.length === 0) {
    throw new Error(`Assembly "${assemblyName}" has no reference sequences`)
  }

  const fh = await open(outputPath, 'w')
  try {
    for (const refSeq of refSeqs) {
      await fh.write(`>${refSeq.name}\n`)
      const sequence = await sequenceService.getSequence({
        assembly: assemblyName,
        refSeq: refSeq.name,
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
