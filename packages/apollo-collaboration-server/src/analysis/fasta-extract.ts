import { open } from 'node:fs/promises'

import { splitStringIntoChunks } from '@apollo-annotation/shared'

import type { DatabaseService } from '../mikro-orm/database.service.js'

export async function extractAssemblyFasta(
  assemblyId: string,
  outputPath: string,
  db: DatabaseService,
) {
  const assembly = await db.assembly.findById(assemblyId)
  if (!assembly) {
    throw new Error(`Assembly "${assemblyId}" not found`)
  }

  const refSeqs = await db.refSeq.findByAssembly(assemblyId)
  if (refSeqs.length === 0) {
    throw new Error(`Assembly "${assemblyId}" has no reference sequences`)
  }

  const fh = await open(outputPath, 'w')
  try {
    for (const refSeq of refSeqs) {
      const description = refSeq.description ? ` ${refSeq.description}` : ''
      await fh.write(`>${refSeq.name}${description}\n`)
      const chunks = await db.refSeqChunk.findByRefSeqAndRange(
        refSeq._id,
        0,
        Math.ceil(refSeq.length / refSeq.chunkSize),
      )
      for (const chunk of chunks) {
        const lines = splitStringIntoChunks(chunk.sequence, 80)
        for (const line of lines) {
          await fh.write(`${line}\n`)
        }
      }
    }
  } finally {
    await fh.close()
  }
}
