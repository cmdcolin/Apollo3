import { randomBytes } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { type ReadableStream, TransformStream } from 'node:stream/web'

import { type GFF3Feature, GFFTransformer } from '@gmod/gff'
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { LocalFile } from 'generic-filehandle2'

import { DatabaseService } from '../mikro-orm/database.service.js'

import type { CreateFileDto } from './dto/create-file.dto.js'
import { type FileRequest, writeFileAndCalculateHash } from './filesUtil.js'

@Injectable()
export class FilesService {
  constructor(
    @Inject(ConfigService)
    private readonly configService: ConfigService<
      { FILE_UPLOAD_FOLDER: string },
      true
    >,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(FilesService.name)

  private get uploadFolder() {
    return this.configService.get('FILE_UPLOAD_FOLDER', { infer: true })
  }

  async uploadFileFromRequest(req: FileRequest, name: string, _size: number) {
    return writeFileAndCalculateHash(
      { originalname: name, stream: req },
      this.uploadFolder,
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

  getFileStream(file: { checksum: string }): ReadableStream<Uint8Array> {
    return Readable.toWeb(
      createReadStream(path.join(this.uploadFolder, file.checksum)),
    ) as ReadableStream<Uint8Array>
  }

  getFileHandle(file: { checksum: string }) {
    return new LocalFile(path.join(this.uploadFolder, file.checksum))
  }

  async getFileContents(file: { checksum: string }) {
    return readFile(path.join(this.uploadFolder, file.checksum))
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
      const filePath = path.join(this.uploadFolder, file.checksum)
      this.logger.debug(`Delete the file "${filePath}" from server folder`)
      try {
        await unlink(filePath)
      } catch {
        throw new InternalServerErrorException(
          `File "${filePath}" could not be deleted from server`,
        )
      }
    }
  }

  async findAll() {
    return this.db.file.findAll()
  }
}
