import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { ReadableStream, TransformStream } from 'node:stream/web'

import { type GFF3Feature, GFFTransformer } from '@gmod/gff'
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'node:crypto'
import { GenericFilehandle, LocalFile } from 'generic-filehandle'

import { DatabaseService } from '../mikro-orm/database.service'

import { CreateFileDto } from './dto/create-file.dto'
import {
  FileRequest,
  LocalFileGzip,
  writeFileAndCalculateHash,
} from './filesUtil'

@Injectable()
export class FilesService {
  constructor(
    private readonly configService: ConfigService<
      { FILE_UPLOAD_FOLDER: string },
      true
    >,
    private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(FilesService.name)

  async uploadFileFromRequest(req: FileRequest, name: string, size: number) {
    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })
    return writeFileAndCalculateHash(
      {
        originalname: name,
        stream: req,
        size,
        contentEncoding: req.header('Content-Encoding'),
      },
      fileUploadFolder,
      this.logger,
    )
  }

  async create(createFileDto: CreateFileDto) {
    this.logger.debug(
      `Add uploaded file info into DB: ${JSON.stringify(createFileDto)}`,
    )
    return this.db.file.create({
      _id: randomBytes(12).toString('hex'),
      basename: createFileDto.basename,
      checksum: createFileDto.checksum,
      type: createFileDto.type,
    })
  }

  async findOne(id: string) {
    const file = await this.db.file.findById(id)
    if (!file) {
      throw new NotFoundException(`File with id "${id}" not found`)
    }
    return file
  }

  getFileStream(
    file: { checksum: string },
    compressed = false,
  ): ReadableStream<Uint8Array> {
    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })
    const fileStream = Readable.toWeb(
      createReadStream(path.join(fileUploadFolder, file.checksum)),
    ) as ReadableStream<Uint8Array>
    if (compressed) {
      return fileStream
    }
    const gunzip = new DecompressionStream('gzip')
    return fileStream.pipeThrough(gunzip) as ReadableStream<Uint8Array>
  }

  getFileHandle(file: { checksum: string; type: string }): GenericFilehandle {
    const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
      infer: true,
    })
    const fileName = path.join(fileUploadFolder, file.checksum)
    switch (file.type) {
      case 'text/x-fai':
      case 'application/x-gzi': {
        return new LocalFileGzip(fileName)
      }
      case 'application/x-bgzip-fasta':
      case 'text/x-gff3':
      case 'text/x-fasta': {
        return new LocalFile(fileName)
      }
      default: {
        throw new Error(`Unsupported file type: ${file.type}`)
      }
    }
  }

  parseGFF3(
    stream: ReadableStream<Uint8Array>,
    options?: { bufferSize?: number },
  ): ReadableStream<GFF3Feature> {
    return stream.pipeThrough(
      new TransformStream(
        new GFFTransformer({
          parseSequences: false,
          parseComments: false,
          parseDirectives: false,
          parseFeatures: true,
          ...options,
        }),
      ),
    )
  }

  async remove(id: string) {
    const file = await this.db.file.findById(id)
    if (!file) {
      throw new NotFoundException(`File with id "${id}" not found`)
    }
    await this.db.file.deleteById(id)

    const otherFiles = await this.db.file.findByChecksum(file.checksum)
    if (!otherFiles) {
      const fileUploadFolder = this.configService.get('FILE_UPLOAD_FOLDER', {
        infer: true,
      })
      const compressedFullFileName = path.join(fileUploadFolder, file.checksum)
      this.logger.debug(
        `Delete the file "${compressedFullFileName}" from server folder`,
      )

      try {
        await unlink(compressedFullFileName)
      } catch {
        throw new InternalServerErrorException(
          `File "${compressedFullFileName}" could not be deleted from server`,
        )
      }
    }
  }

  async findAll() {
    return this.db.file.findAll()
  }
}
