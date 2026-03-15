import {
  AssemblySpecificChange,
  type FeatureRow,
  type FileRow,
  type RefSeqChunkRow,
  type RefSeqRow,
  type ServerDataStore,
} from '@apollo-annotation/common'
import type { GFF3Feature } from '@gmod/gff'
import ObjectID from 'bson-objectid'

import { gff3ToAnnotationFeature } from '../GFF3/index.js'

import { flattenFeatureSnapshot } from './AddFeatureChange.js'

export abstract class FromFileBaseChange extends AssemblySpecificChange {
  private chunkBuffer: RefSeqChunkRow[] = []
  private readonly CHUNK_BATCH_SIZE = 50

  private async bufferChunk(chunk: RefSeqChunkRow, backend: ServerDataStore) {
    this.chunkBuffer.push(chunk)
    if (this.chunkBuffer.length >= this.CHUNK_BATCH_SIZE) {
      await backend.refSeqChunkRepository.createMany(this.chunkBuffer)
      this.chunkBuffer = []
    }
  }

  private async flushChunkBuffer(backend: ServerDataStore) {
    if (this.chunkBuffer.length > 0) {
      await backend.refSeqChunkRepository.createMany(this.chunkBuffer)
      this.chunkBuffer = []
    }
  }

  async addRefSeqIntoDb(
    fileRow: FileRow,
    assembly: string,
    backend: ServerDataStore,
  ) {
    const { logger } = this
    const { filesService, refSeqChunkRepository, refSeqRepository } = backend
    const { CHUNK_SIZE } = process.env
    const customChunkSize = CHUNK_SIZE ? Number(CHUNK_SIZE) : undefined
    const defaultChunkSize = customChunkSize ?? 262_144
    let chunkIndex = 0
    let refSeqLen = 0
    let currentRefSeqId: string | undefined
    let currentChunkSize = defaultChunkSize
    let fastaInfoStarted = fileRow.type !== 'text/x-gff3'

    const sequenceStream = filesService.getFileStream(fileRow)
    let sequenceBuffer = ''
    let incompleteLine = ''
    let lastLineIsIncomplete = true
    let parsingStarted = false
    // eslint-disable-next-line no-console
    console.log(
      `[addRefSeqIntoDb] Starting sequence stream for checksum=${fileRow.checksum} type=${fileRow.type}`,
    )
    let lineCount = 0
    const decoder = new TextDecoder()
    for await (const data of sequenceStream) {
      const chunk = decoder.decode(data)
      lastLineIsIncomplete = !chunk.endsWith('\n')
      const lines = chunk.split(/\r?\n/)
      if (incompleteLine) {
        lines[0] = `${incompleteLine}${lines[0]}`
        incompleteLine = ''
      }
      if (lastLineIsIncomplete) {
        incompleteLine = lines.pop() ?? ''
      }
      for (const line of lines) {
        lineCount++
        if (lineCount % 1_000_000 === 0) {
          logger.debug?.(`Processed ${lineCount} lines`)
        }
        if (!fastaInfoStarted) {
          if (line.trim() === '##FASTA') {
            fastaInfoStarted = true
          }
          continue
        }
        const refSeqInfoLine = /^>\s*(\S+)\s*(.*)/.exec(line)
        if (refSeqInfoLine) {
          parsingStarted = true
          logger.debug?.(
            `Reference sequence information line "${refSeqInfoLine[0]}"`,
          )
          if (sequenceBuffer !== '' && currentRefSeqId) {
            refSeqLen += sequenceBuffer.length
            const chunkRow: RefSeqChunkRow = {
              _id: new ObjectID().toHexString(),
              refSeq: currentRefSeqId,
              n: chunkIndex,
              sequence: sequenceBuffer,
            }
            await this.bufferChunk(chunkRow, backend)
            await this.flushChunkBuffer(backend)
            sequenceBuffer = ''
          }
          if (currentRefSeqId) {
            await refSeqRepository.updateById(currentRefSeqId, {
              length: refSeqLen,
            })
          }
          refSeqLen = 0
          chunkIndex = 0

          const name = refSeqInfoLine[1].trim()
          const description = refSeqInfoLine[2] ? refSeqInfoLine[2].trim() : ''
          currentRefSeqId = new ObjectID().toHexString()
          currentChunkSize = customChunkSize ?? defaultChunkSize
          const refSeqRow: RefSeqRow = {
            _id: currentRefSeqId,
            name,
            description,
            assembly,
            length: 0,
            chunkSize: currentChunkSize,
          }
          await refSeqRepository.create(refSeqRow)
          logger.debug?.(
            `Added new refSeq "${name}", desc "${description}", id "${currentRefSeqId}"`,
          )
        } else if (/\S/.test(line)) {
          if (!currentRefSeqId) {
            throw new Error('No refSeq document found')
          }
          sequenceBuffer += line.replaceAll(/\s/g, '')
          while (sequenceBuffer.length >= currentChunkSize) {
            const sequence = sequenceBuffer.slice(0, currentChunkSize)
            refSeqLen += sequence.length
            const chunkRow: RefSeqChunkRow = {
              _id: new ObjectID().toHexString(),
              refSeq: currentRefSeqId,
              n: chunkIndex,
              sequence,
            }
            await this.bufferChunk(chunkRow, backend)
            chunkIndex++
            sequenceBuffer = sequenceBuffer.slice(currentChunkSize)
          }
        }
      }
    }
    // eslint-disable-next-line no-console
    console.log(
      `[addRefSeqIntoDb] Stream complete: ${lineCount} lines, parsingStarted=${parsingStarted}`,
    )
    if (!parsingStarted) {
      throw new Error('No reference sequences found in file')
    }

    if (sequenceBuffer || lastLineIsIncomplete) {
      if (!currentRefSeqId) {
        throw new Error('No refSeq document found')
      }
      if (lastLineIsIncomplete) {
        sequenceBuffer += incompleteLine
      }
      refSeqLen += sequenceBuffer.length
      logger.debug?.(
        `Creating refSeq chunk number ${chunkIndex} of "${currentRefSeqId}"`,
      )
      const chunkRow: RefSeqChunkRow = {
        _id: new ObjectID().toHexString(),
        refSeq: currentRefSeqId,
        n: chunkIndex,
        sequence: sequenceBuffer,
      }
      await this.bufferChunk(chunkRow, backend)
      await this.flushChunkBuffer(backend)
      await refSeqRepository.updateById(currentRefSeqId, { length: refSeqLen })
    }
  }

  async removeExistingFeatures(backend: ServerDataStore) {
    const { assembly, logger } = this
    logger.debug?.(`Removing existing features for assembly = ${assembly}`)
    const refSeqs = await backend.refSeqRepository.findByAssembly(assembly)
    const refSeqIds = refSeqs.map((r) => r._id)
    await backend.featureRepository.deleteByRefSeqs(refSeqIds)
  }

  private refSeqCache = new Map<string, RefSeqRow>()
  private featureBuffer: FeatureRow[] = []
  private readonly FEATURE_BATCH_SIZE = 500

  async addFeatureIntoDb(gff3Feature: GFF3Feature, backend: ServerDataStore) {
    const { assembly, refSeqCache } = this

    const [{ seq_id: refName }] = gff3Feature
    if (!refName) {
      throw new Error(
        `Valid seq_id not found in feature ${JSON.stringify(gff3Feature)}`,
      )
    }
    let refSeqRow = refSeqCache.get(refName)
    if (!refSeqRow) {
      refSeqRow =
        (await backend.refSeqRepository.findByNameAndAssembly(
          refName,
          assembly,
        )) ?? undefined
      if (refSeqRow) {
        refSeqCache.set(refName, refSeqRow)
      }
    }
    if (!refSeqRow) {
      throw new Error(
        `RefSeq was not found by assembly "${assembly}" and seq_id "${refName}" not found`,
      )
    }
    const newFeature = gff3ToAnnotationFeature(gff3Feature, refSeqRow._id)
    const rows = flattenFeatureSnapshot(newFeature, refSeqRow._id)
    for (const row of rows) {
      this.featureBuffer.push(row)
    }
    if (this.featureBuffer.length >= this.FEATURE_BATCH_SIZE) {
      await this.flushFeatureBuffer(backend)
    }
  }

  async flushFeatureBuffer(backend: ServerDataStore) {
    if (this.featureBuffer.length > 0) {
      await backend.featureRepository.createMany(this.featureBuffer)
      this.featureBuffer = []
    }
  }
}
