import { createReadStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { ReadableStream, TransformStream } from 'node:stream/web'

import { File, FileDocument } from '@apollo-annotation/schemas'
import { type GFF3Feature, GFFTransformer } from '@gmod/gff'
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectModel } from '@nestjs/mongoose'
import { ObjectId } from 'mongodb'
import { GenericFilehandle, LocalFile } from 'generic-filehandle'
import { Model } from 'mongoose'

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
    @Optional()
    @InjectModel(File.name)
    private readonly fileModel: Model<FileDocument>,
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
    if (this.db.useV2Backend) {
      return this.db.file.create({
        _id: new ObjectId().toHexString(),
        basename: createFileDto.basename,
        checksum: createFileDto.checksum,
        type: createFileDto.type,
      })
    }
    return this.fileModel.create(createFileDto)
  }

  async findOne(id: string) {
    if (this.db.useV2Backend) {
      const file = await this.db.file.findById(id)
      if (!file) {
        throw new NotFoundException(`File with id "${id}" not found`)
      }
      return file
    }
    const file = await this.fileModel.findById(id).exec()
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

  /**
   * Delete file from Files collection in Mongo. Check and see if that checksum is used elsewhere in the collection; if not, delete the file as well
   * @param id - fileId to be deleted
   * @returns
   */
  async remove(id: string) {
    if (this.db.useV2Backend) {
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
        const compressedFullFileName = path.join(
          fileUploadFolder,
          file.checksum,
        )
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
      return
    }
    const file = await this.fileModel.findById(id).exec()
    if (!file) {
      throw new NotFoundException(`File with id "${id}" not found`)
    }
    await this.fileModel.findByIdAndDelete(id).exec()

    const otherFiles = await this.fileModel
      .findOne({ checksum: file.checksum })
      .exec()
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
    return
  }

  async findAll() {
    if (this.db.useV2Backend) {
      return this.db.file.findAll()
    }
    return this.fileModel.find().exec()
  }
}
