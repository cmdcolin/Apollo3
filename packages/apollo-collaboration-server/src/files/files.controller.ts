import { Readable } from 'node:stream'

import {
  Controller,
  Delete,
  Get,
  Head,
  Inject,
  Logger,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'
import type { Response } from 'express'

import { Role } from '../utils/role/role.enum.js'
import { Roles } from '../utils/roles.guard.js'

import { FileStorageEngine } from './FileStorageEngine.js'
import { FilesInterceptor as StreamingFileInterceptor } from './files.interceptor.js'
import { FilesService } from './files.service.js'
import type { UploadedFile as UploadedApolloFile } from './filesUtil.js'

@Roles(Role.Admin)
@Controller('files')
export class FilesController {
  constructor(
    @Inject(FilesService) private readonly filesService: FilesService,
  ) {}
  private readonly logger = new Logger(FilesController.name)

  @Get()
  findAll() {
    return this.filesService.findAll()
  }

  @Head()
  filesHead() {
    return ''
  }

  /**
   * Stream file to server and check checksum
   * @param file - File to save
   * @returns Return ....  if save was successful
   * or in case of error return throw exception
   */
  @Post()
  @UseInterceptors(
    FileInterceptor('file', { storage: new FileStorageEngine() }),
    StreamingFileInterceptor,
  )
  async uploadFile(
    @UploadedFile() file: UploadedApolloFile,
    @Query('type') type: 'text/x-gff3' | 'text/x-fasta',
  ) {
    this.logger.log(
      `Upload complete: "${file.originalname}", checksum="${file.checksum}", type="${type}"`,
    )
    return this.filesService.create({
      basename: file.originalname,
      checksum: file.checksum,
      type,
    })
  }

  /**
   * Download file from files -collection
   * @param id -
   * @returns
   */
  @Get(':id')
  async downloadFile(
    @Param('id') id: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile> {
    const file = await this.filesService.findOne(id)
    res.set({
      'Content-Type': file.type,
      'Content-Disposition': `attachment; filename="${file.basename}"`,
    })
    return new StreamableFile(
      Readable.fromWeb(this.filesService.getFileStream(file)),
    )
  }

  /**
   * Delete file. Check and see if that checksum is used elsewhere; if not, delete the file as well
   * @param id - fileId to be deleted
   * @returns
   */
  @Delete(':id')
  async remove(@Param('id') id: string) {
    this.logger.debug(`Delete fileId "${id}")`)
    return this.filesService.remove(id)
  }
}
