/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import {
  AssemblySpecificChange,
  type FileRow,
  type RefSeqChunkRow,
  type RefSeqRow,
  type ServerDataStore,
  type ServerDataStoreV2,
} from '@apollo-annotation/common'
import {
  type FileDocument,
  type RefSeqDocument,
} from '@apollo-annotation/schemas'
import { type GFF3Feature } from '@gmod/gff'
import ObjectID from 'bson-objectid'

import { gff3ToAnnotationFeature } from '../GFF3'

import { flattenFeatureSnapshot } from './AddFeatureChange'

export abstract class FromFileBaseChange extends AssemblySpecificChange {
  async addRefSeqIntoDb(
    fileDoc: FileDocument,
    assembly: string,
    backend: ServerDataStore,
  ) {
    const { logger } = this
    const { filesService, refSeqChunkModel, refSeqModel, user } = backend
    const { CHUNK_SIZE } = process.env
    const customChunkSize = CHUNK_SIZE ? Number(CHUNK_SIZE) : undefined
    let chunkIndex = 0
    let refSeqLen = 0
    let refSeqDoc: RefSeqDocument | undefined
    let fastaInfoStarted = fileDoc.type !== 'text/x-gff3'

    // Read data from compressed file and parse the content
    const sequenceStream = filesService.getFileStream(fileDoc)
    let sequenceBuffer = ''
    let incompleteLine = ''
    let lastLineIsIncomplete = true
    let parsingStarted = false
    logger.debug?.('starting sequence stream')
    let lineCount = 0
    const decoder = new TextDecoder()
    // @ts-expect-error type is wrong here
    // eslint-disable-next-line @typescript-eslint/await-thenable
    for await (const data of sequenceStream) {
      const chunk = decoder.decode(data)
      lastLineIsIncomplete = !chunk.endsWith('\n')
      // chunk is small enough that you can split the whole thing into lines without having to make it into smaller chunks first.
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
        // In case of GFF3 file we start to read sequence after '##FASTA' is found
        if (!fastaInfoStarted) {
          if (line.trim() === '##FASTA') {
            fastaInfoStarted = true
          }
          continue
        }
        const refSeqInfoLine = /^>\s*(\S+)\s*(.*)/.exec(line)
        // Add new ref sequence info if we are reference seq info line
        if (refSeqInfoLine) {
          parsingStarted = true
          logger.debug?.(
            `Reference sequence information line "${refSeqInfoLine[0]}"`,
          )

          // If there is sequence from previous reference sequence then we need to add it to previous ref seq
          if (sequenceBuffer !== '') {
            if (!refSeqDoc) {
              throw new Error('No refSeq document found')
            }
            refSeqLen += sequenceBuffer.length
            // We cannot use Mongo 'session' / transaction here because Mongo has 16 MB limit for transaction
            await refSeqChunkModel.create([
              {
                refSeq: refSeqDoc._id,
                n: chunkIndex,
                sequence: sequenceBuffer,
                user,
                status: -1,
              },
            ])
            sequenceBuffer = ''
          }
          await refSeqDoc?.updateOne({ length: refSeqLen })
          // await refSeqDoc?.updateOne({ length: refSeqLen }, { session })
          refSeqLen = 0
          chunkIndex = 0

          const name = refSeqInfoLine[1].trim()
          const description = refSeqInfoLine[2] ? refSeqInfoLine[2].trim() : ''

          // We cannot use Mongo 'session' / transaction here because Mongo has 16 MB limit for transaction
          const [newRefSeqDoc] = await refSeqModel.create([
            {
              name,
              description,
              assembly,
              length: 0,
              ...(customChunkSize ? { chunkSize: customChunkSize } : null),
              user,
              status: -1,
            },
          ])
          logger.debug?.(
            `Added new refSeq "${name}", desc "${description}", docId "${newRefSeqDoc._id}"`,
          )
          refSeqDoc = newRefSeqDoc
        } else if (/\S/.test(line)) {
          if (!refSeqDoc) {
            throw new Error('No refSeq document found')
          }
          const { _id, chunkSize } = refSeqDoc
          sequenceBuffer += line.replaceAll(/\s/g, '')
          // If sequence block > chunk size then save chunk into Mongo
          while (sequenceBuffer.length >= chunkSize) {
            const sequence = sequenceBuffer.slice(0, chunkSize)
            refSeqLen += sequence.length
            // We cannot use Mongo 'session' / transaction here because Mongo has 16 MB limit for transaction
            await refSeqChunkModel.create([
              { refSeq: _id, n: chunkIndex, sequence, user, status: -1 },
            ])
            chunkIndex++
            // Set remaining sequence
            sequenceBuffer = sequenceBuffer.slice(chunkSize)
          }
        }
      }
    }
    if (!parsingStarted) {
      throw new Error('No reference sequences found in file')
    }

    if (sequenceBuffer || lastLineIsIncomplete) {
      if (!refSeqDoc) {
        throw new Error('No refSeq document found')
      }
      // If the file did not end with line break so the last line is incomplete
      if (lastLineIsIncomplete) {
        sequenceBuffer += incompleteLine
      }
      refSeqLen += sequenceBuffer.length
      logger.verbose?.(
        `*** Add the very last chunk to ref seq ("${refSeqDoc._id}", index ${chunkIndex} and total length for ref seq is ${refSeqLen}): "${sequenceBuffer}"`,
      )
      logger.debug?.(
        `Creating refSeq chunk number ${chunkIndex} of "${refSeqDoc._id}"`,
      )
      // We cannot use Mongo 'session' / transaction here because Mongo has 16 MB limit for transaction
      await refSeqChunkModel.create([
        {
          refSeq: refSeqDoc._id,
          n: chunkIndex,
          sequence: sequenceBuffer,
          user,
          status: -1,
        },
      ])
      await refSeqDoc.updateOne({ length: refSeqLen })
    }
  }

  async addRefSeqIntoDbV2(
    fileRow: FileRow,
    assembly: string,
    backend: ServerDataStoreV2,
  ) {
    const { logger } = this
    const { filesService, refSeqChunkRepository, refSeqRepository, user } =
      backend
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
    logger.debug?.('starting sequence stream (V2)')
    let lineCount = 0
    const decoder = new TextDecoder()
    // @ts-expect-error type is wrong here
    // eslint-disable-next-line @typescript-eslint/await-thenable
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
              user,
              status: -1,
            }
            await refSeqChunkRepository.create(chunkRow)
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
            user,
            status: -1,
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
              user,
              status: -1,
            }
            await refSeqChunkRepository.create(chunkRow)
            chunkIndex++
            sequenceBuffer = sequenceBuffer.slice(currentChunkSize)
          }
        }
      }
    }
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
        user,
        status: -1,
      }
      await refSeqChunkRepository.create(chunkRow)
      await refSeqRepository.updateById(currentRefSeqId, { length: refSeqLen })
    }
  }

  async removeExistingFeaturesV2(backend: ServerDataStoreV2) {
    const { assembly, logger } = this
    logger.debug?.(`Removing existing features for assembly = ${assembly} (V2)`)
    const refSeqs = await backend.refSeqRepository.findByAssembly(assembly)
    const refSeqIds = refSeqs.map((r) => r._id)
    await backend.featureRepository.deleteByRefSeqs(refSeqIds)
  }

  private refSeqCacheV2 = new Map<string, RefSeqRow>()

  async addFeatureIntoDbV2(
    gff3Feature: GFF3Feature,
    backend: ServerDataStoreV2,
  ) {
    const { assembly, refSeqCacheV2 } = this

    const [{ seq_id: refName }] = gff3Feature
    if (!refName) {
      throw new Error(
        `Valid seq_id not found in feature ${JSON.stringify(gff3Feature)}`,
      )
    }
    let refSeqRow = refSeqCacheV2.get(refName)
    if (!refSeqRow) {
      refSeqRow =
        (await backend.refSeqRepository.findByNameAndAssembly(
          refName,
          assembly,
        )) ?? undefined
      if (refSeqRow) {
        refSeqCacheV2.set(refName, refSeqRow)
      }
    }
    if (!refSeqRow) {
      throw new Error(
        `RefSeq was not found by assembly "${assembly}" and seq_id "${refName}" not found`,
      )
    }
    const featureIds: string[] = []
    const newFeature = gff3ToAnnotationFeature(
      gff3Feature,
      refSeqRow._id,
      featureIds,
    )
    const rows = flattenFeatureSnapshot(newFeature, refSeqRow._id)
    for (const row of rows) {
      row.user = backend.user
      row.status = -1
    }
    await backend.featureRepository.createMany(rows)
  }

  private refSeqCache = new Map<string, RefSeqDocument>()

  async removeExistingFeatures(backend: ServerDataStore) {
    const { featureModel, refSeqModel } = backend
    const { assembly, logger } = this
    logger.debug?.(`Removing existing features for assembly = ${assembly}`)

    const refSeqs: RefSeqDocument[] = await refSeqModel
      .find({ assembly })
      .exec()

    for (const refSeq of refSeqs) {
      await featureModel.deleteMany({ refSeq: refSeq._id })
    }
  }

  async addFeatureIntoDb(gff3Feature: GFF3Feature, backend: ServerDataStore) {
    const { featureModel, refSeqModel, user } = backend
    const { assembly, refSeqCache } = this

    const [{ seq_id: refName }] = gff3Feature
    if (!refName) {
      throw new Error(
        `Valid seq_id not found in feature ${JSON.stringify(gff3Feature)}`,
      )
    }
    let refSeqDoc = refSeqCache.get(refName)
    if (!refSeqDoc) {
      refSeqDoc =
        (await refSeqModel.findOne({ assembly, name: refName }).exec()) ??
        undefined
      if (refSeqDoc) {
        refSeqCache.set(refName, refSeqDoc)
      }
    }
    if (!refSeqDoc) {
      throw new Error(
        `RefSeq was not found by assembly "${assembly}" and seq_id "${refName}" not found`,
      )
    }
    // Let's add featureId to parent feature
    const featureIds: string[] = []

    const newFeature = gff3ToAnnotationFeature(
      gff3Feature,
      refSeqDoc._id,
      featureIds,
    )

    // Add into Mongo
    // We cannot use Mongo 'session' / transaction here because Mongo has 16 MB limit for transaction
    await featureModel.create([
      { allIds: featureIds, ...newFeature, user, status: -1 },
    ])
  }
}
