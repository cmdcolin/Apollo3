import * as fs from 'node:fs'
import path from 'node:path'

import type {
  SerializedAddAssemblyAndFeaturesFromFileChange,
  SerializedAddAssemblyFromFileChange,
} from '@apollo-annotation/shared'
import { Args, Flags } from '@oclif/core'
import { ObjectId } from 'bson'

import { FileCommand } from '../../fileCommand.js'
import { submitAssembly } from '../../utils.js'

export default class AddGff extends FileCommand {
  static summary = 'Add new assembly from GFF3 file'
  static description =
    'The GFF3 file provides features. A separate indexed FASTA must be provided for the sequence.'

  static examples = [
    {
      description: 'Import sequences and features:',
      command:
        '<%= config.bin %> <%= command.id %> annotations.gff3 --fasta genome.fa -a myAssembly',
    },
    {
      description: 'Import sequences only (no features):',
      command:
        '<%= config.bin %> <%= command.id %> annotations.gff3 --fasta genome.fa -a myAssembly -o',
    },
  ]

  static args = {
    'input-file': Args.string({
      description: 'Input GFF3 file (path accessible to the server)',
      required: true,
    }),
  }

  static flags = {
    assembly: Flags.string({
      char: 'a',
      description: 'Name for this assembly. Use the file name if omitted',
    }),
    fasta: Flags.string({
      description:
        'Path to indexed FASTA file. The .fai index is auto-detected at <fasta>.fai',
      required: true,
    }),
    fai: Flags.string({
      description: 'Path to .fai index (defaults to <fasta>.fai)',
    }),
    gzi: Flags.string({
      description: 'Path to .gzi index (for bgzip FASTA)',
    }),
    'omit-features': Flags.boolean({
      char: 'o',
      description: 'Do not import features, only register the sequences',
    }),
    force: Flags.boolean({
      char: 'f',
      description: 'Delete existing assembly, if it exists',
    }),
  }

  public async run(): Promise<void> {
    const { args, flags } = await this.parse(AddGff)

    if (!fs.existsSync(args['input-file'])) {
      this.error(`File ${args['input-file']} does not exist`)
    }
    if (!fs.existsSync(flags.fasta)) {
      this.error(`FASTA file "${flags.fasta}" does not exist`)
    }

    const access = await this.getAccess()
    const assemblyName = flags.assembly ?? path.basename(args['input-file'])

    const fai = flags.fai ?? `${flags.fasta}.fai`
    if (!fs.existsSync(fai)) {
      this.error(
        `Index file "${fai}" does not exist. Create it with: samtools faidx ${flags.fasta}`,
      )
    }

    const gzi = flags.gzi ?? `${flags.fasta}.gzi`
    const hasGzi = fs.existsSync(gzi)

    const sequenceSource = {
      type: 'fasta' as const,
      fa: flags.fasta,
      fai,
      gzi: hasGzi ? gzi : undefined,
    }

    const body:
      | SerializedAddAssemblyFromFileChange
      | SerializedAddAssemblyAndFeaturesFromFileChange = flags['omit-features']
      ? {
          assemblyName,
          sequenceSource,
          typeName: 'AddAssemblyFromFileChange',
          assembly: new ObjectId().toHexString(),
        }
      : {
          assemblyName,
          fastaPath: flags.fasta,
          faiPath: fai,
          gziPath: hasGzi ? gzi : undefined,
          gff3Path: args['input-file'],
          typeName: 'AddAssemblyAndFeaturesFromFileChange',
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
