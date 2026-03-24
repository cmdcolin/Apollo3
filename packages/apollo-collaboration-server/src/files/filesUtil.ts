import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Readable } from 'node:stream'

import type { Logger } from '@nestjs/common'
import type { Request } from 'express'

export interface UploadedFile extends Express.Multer.File {
  checksum: string
}

export interface FileRequest extends Omit<Request, 'file'> {
  file: Partial<UploadedFile>
}

function collectStream(stream: Readable) {
  const chunks: Buffer[] = []
  return new Promise<Buffer>((resolve, reject) => {
    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk)
    })
    stream.on('end', () => {
      resolve(Buffer.concat(chunks))
    })
    stream.on('error', reject)
  })
}

export async function writeFileAndCalculateHash(
  file: { originalname: string; stream: Readable },
  fileUploadFolder: string,
  logger: Logger,
) {
  const { originalname, stream } = file
  await mkdir(fileUploadFolder, { recursive: true })
  logger.log(`Starting file upload: "${originalname}"`)

  const data = await collectStream(stream)
  logger.debug(`Received ${data.length} bytes for "${originalname}"`)

  const checksum = createHash('md5').update(data).digest('hex')
  await writeFile(path.join(fileUploadFolder, checksum), data)

  logger.debug(`Uploaded file checksum: "${checksum}"`)
  logger.log('File upload finished')
  return checksum
}
