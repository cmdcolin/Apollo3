import { readFile } from 'node:fs/promises'

import { type SequenceSource, assemblyId } from '@apollo-annotation/common'
import { TwoBitFile } from '@gmod/twobit'
import { ForbiddenException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { LocalFile, RemoteFile } from 'generic-filehandle2'

import { ChecksService } from '../checks/checks.service.js'
import { FeaturesService } from '../features/features.service.js'
import { DatabaseService } from '../mikro-orm/database.service.js'

import type { CreateAssemblyDto } from './dto/create-assembly.dto.js'
import type { UpdateAssemblyDto } from './dto/update-assembly.dto.js'

function openFilehandle(pathOrUrl: string) {
  if (pathOrUrl.startsWith('http://') || pathOrUrl.startsWith('https://')) {
    return new RemoteFile(pathOrUrl)
  }
  return new LocalFile(pathOrUrl)
}

async function readSequencesFromFai(faiPath: string) {
  let content: string
  if (faiPath.startsWith('http://') || faiPath.startsWith('https://')) {
    const res = await fetch(faiPath)
    content = await res.text()
  } else {
    content = await readFile(faiPath, 'utf8')
  }
  return content
    .trim()
    .split('\n')
    .filter((line) => line.length > 0)
    .filter((line) => line.includes('\t'))
    .map((line) => {
      const tabIdx = line.indexOf('\t')
      const name = line.slice(0, tabIdx)
      const length = Number(line.slice(tabIdx + 1).split('\t')[0])
      return { name, length }
    })
}

async function readSequencesFromTwobit(twobitPath: string) {
  const twobit = new TwoBitFile({ filehandle: openFilehandle(twobitPath) })
  const names = await twobit.getSequenceNames()
  const sequences: { name: string; length: number }[] = []
  for (const name of names) {
    const length = await twobit.getSequenceSize(name)
    if (length !== undefined) {
      sequences.push({ name, length })
    }
  }
  return sequences
}

export async function readSequencesFromSource(source: SequenceSource) {
  if (source.type === 'twobit') {
    return readSequencesFromTwobit(source.twobit)
  }
  return readSequencesFromFai(source.fai)
}

@Injectable()
export class AssembliesService {
  constructor(
    @Inject(ChecksService) private readonly checksService: ChecksService,
    @Inject(FeaturesService) private readonly featuresService: FeaturesService,
    @Inject(DatabaseService) private readonly db: DatabaseService,
  ) {}

  private readonly logger = new Logger(AssembliesService.name)

  async create(createAssemblyDto: CreateAssemblyDto) {
    const defaultChecks = await this.db.checkConfig.findDefaults()
    const defaultCheckIds = defaultChecks.map((c) => c._id)
    const newAssemblyId = assemblyId()
    return this.db.assembly.create({
      _id: newAssemblyId,
      name: createAssemblyDto.name,
      displayName: createAssemblyDto.displayName,
      description: createAssemblyDto.description,
      aliases: createAssemblyDto.aliases,
      checks: defaultCheckIds,
      organism: createAssemblyDto.organism,
      sequenceSource: createAssemblyDto.sequenceSource,
      visibility: createAssemblyDto.visibility,
    })
  }

  async updateChecks(_id: string, checks: string[]) {
    await this.db.assembly.updateById(_id, { checks })

    const checkResults = await this.checksService.find({ assembly: _id })
    const obsoleteCheckIds = checkResults
      .filter((x) => !checks.includes(x.name))
      .map((x) => x._id)
    await this.checksService.deleteChecks(obsoleteCheckIds)

    const assembly = await this.db.assembly.findById(_id)
    if (assembly?.sequenceSource) {
      const sequences = await readSequencesFromSource(assembly.sequenceSource)
      for (const { length, name } of sequences) {
        const roots = await this.db.feature.findRootsByRange(
          _id,
          name,
          0,
          length,
        )
        for (const root of roots) {
          await this.featuresService.checkFeature(root._id)
        }
      }
    }
  }

  async findAll() {
    return this.db.assembly.findAll()
  }

  async findPublic() {
    return this.db.assembly.findPublic()
  }

  async findForUser(user: { id?: string; role?: string } | undefined) {
    if (user) {
      return this.findAll()
    }
    return this.findPublic()
  }

  async findOne(id: string) {
    const assembly = await this.db.assembly.findById(id)
    if (!assembly) {
      throw new NotFoundException(`Assembly with id "${id}" not found`)
    }
    return assembly
  }

  async findOneForUser(
    id: string,
    user: { id?: string; role?: string } | undefined,
  ) {
    const assembly = await this.findOne(id)
    if (!user && assembly.visibility !== 'public') {
      throw new ForbiddenException()
    }
    return assembly
  }

  async findOneByNameForUser(
    name: string,
    user: { id?: string; role?: string } | undefined,
  ) {
    const assembly = await this.findOneByName(name)
    if (!user && assembly.visibility !== 'public') {
      throw new ForbiddenException()
    }
    return assembly
  }

  async findOneByName(name: string) {
    const assembly = await this.db.assembly.findByName(name)
    if (!assembly) {
      throw new NotFoundException(`Assembly with name "${name}" not found`)
    }
    return assembly
  }

  async update(id: string, updateAssemblyDto: UpdateAssemblyDto) {
    return this.db.assembly.updateById(id, updateAssemblyDto)
  }

  async getSequences(id: string) {
    const assembly = await this.db.assembly.findById(id)
    if (!assembly) {
      throw new NotFoundException(`Assembly with id "${id}" not found`)
    }
    if (!assembly.sequenceSource) {
      throw new NotFoundException(
        `Assembly with id "${id}" has no sequence source`,
      )
    }
    return readSequencesFromSource(assembly.sequenceSource)
  }

  async remove(id: string) {
    return this.db.assembly.deleteById(id)
  }
}
