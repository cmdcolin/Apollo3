import * as fs from 'node:fs'
import path from 'node:path'

import type { SerializedAddAssemblyFromFileChange } from '@apollo-annotation/shared'
import { Args, Flags } from '@oclif/core'
import { ObjectId } from 'bson'

import { FileCommand } from '../../fileCommand.js'
import { submitAssembly } from '../../utils.js'

export default class AddFasta extends FileCommand {
  static summary = 'Add a new assembly from fasta input'
  static description = `Add new assembly from an indexed FASTA or TwoBit file.
The input can be:
  * A local bgzip'd FASTA with .fai and .gzi indexes
  * A local plain FASTA with .fai index
  * A remote (URL) bgzip'd FASTA with .fai and .gzi indexes
  * A local .2bit file

Files must be accessible to the Apollo server.`

  static examples = [
    {
      description: 'From local bgzip FASTA (indexes auto-detected):',
      command: '<%= config.bin %> <%= command.id %> genome.fa.gz -a myAssembly',
    },
    {
      description: 'From local plain FASTA with index:',
      command: '<%= config.bin %> <%= command.id %> genome.fa -a myAssembly',
    },
    {
      description: 'From remote bgzip FASTA:',
      command:
        '<%= config.bin %> <%= command.id %> https://.../genome.fa.gz -a myAssembly',
    },
  ]

  static args = {
    input: Args.string({
      description:
        'Input FASTA file (local path or URL). Indexes are auto-detected at <input>.fai and <input>.gzi unless overridden with --fai/--gzi.',
      required: true,
    }),
  }

  static flags = {
    assembly: Flags.string({
      char: 'a',
      description: 'Name for this assembly. Use the file name if omitted',
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Delete existing assembly, if it exists',
    }),
    fai: Flags.string({
      description: 'Path or URL to .fai index file',
    }),
    gzi: Flags.string({
      description: 'Path or URL to .gzi index file (for bgzip FASTA)',
    }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AddFasta)

    const access = await this.getAccess()

    const assemblyName = flags.assembly ?? path.basename(args.input)
    const isRemote = isValidHttpUrl(args.input)

    const fai = flags.fai ?? `${args.input}.fai`
    const gzi = flags.gzi ?? `${args.input}.gzi`

    if (!isRemote && !fs.existsSync(args.input)) {
      this.error(`Input file "${args.input}" does not exist`)
    }
    if (!isRemote && !fs.existsSync(fai)) {
      this.error(
        `Index file "${fai}" does not exist. Create it with: samtools faidx ${args.input}`,
      )
    }

    const hasGzi = isRemote
      ? await urlExists(gzi)
      : fs.existsSync(gzi)

    const body: SerializedAddAssemblyFromFileChange = {
      assemblyName,
      typeName: 'AddAssemblyFromFileChange',
      sequenceSource: {
        type: 'fasta',
        fa: args.input,
        fai,
        gzi: hasGzi ? gzi : undefined,
      },
      assembly: new ObjectId().toHexString(),
    }

    const rec = await submitAssembly(
      access.address,
      access.accessToken,
      body,
      flags.force,
    )
    this.log(JSON.stringify(rec, null, 2))
  }
}

function isValidHttpUrl(x: string) {
  try {
    const url = new URL(x)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

async function urlExists(url: string) {
  try {
    const res = await fetch(url, { method: 'HEAD' })
    return res.ok
  } catch {
    return false
  }
}
