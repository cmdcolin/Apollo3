import { Flags } from '@oclif/core'
import { Agent, fetch } from 'undici'

import { BaseCommand } from '../../baseCommand.js'
import { createFetchErrorMessage } from '../../utils.js'

export default class AddFromFasta extends BaseCommand<typeof AddFromFasta> {
  static summary = 'Add an assembly from a FASTA or 2bit sequence file'
  static description = `Creates an assembly whose reference sequences are derived from the
provided sequence source. For FASTA files, the server reads the FAI index to
populate sequence names and lengths. For 2bit files, the header is read instead.

Paths may be local file paths (accessible to the server) or HTTP/HTTPS URLs.`

  static examples = [
    {
      description: 'Add assembly from indexed FASTA:',
      command:
        '<%= config.bin %> <%= command.id %> -a myAssembly -f genome.fa -i genome.fa.fai',
    },
    {
      description: 'Add assembly from bgzip-compressed FASTA:',
      command:
        '<%= config.bin %> <%= command.id %> -a myAssembly -f genome.fa.gz -i genome.fa.gz.fai -z genome.fa.gz.gzi',
    },
    {
      description: 'Add assembly from remote FASTA URLs:',
      command:
        '<%= config.bin %> <%= command.id %> -a myAssembly -f https://example.com/genome.fa.gz -i https://example.com/genome.fa.gz.fai -z https://example.com/genome.fa.gz.gzi',
    },
    {
      description: 'Add assembly from 2bit file:',
      command:
        '<%= config.bin %> <%= command.id %> -a myAssembly -t genome.2bit',
    },
  ]

  static flags = {
    assembly: Flags.string({
      char: 'a',
      description: 'Assembly name',
      required: true,
    }),
    fasta: Flags.string({
      char: 'f',
      description: 'FASTA file path or URL',
      exclusive: ['twobit'],
    }),
    fai: Flags.string({
      char: 'i',
      description: 'FAI index path or URL (defaults to --fasta value + ".fai")',
      exclusive: ['twobit'],
    }),
    gzi: Flags.string({
      char: 'z',
      description:
        'GZI index path or URL (required for bgzip-compressed FASTA)',
      exclusive: ['twobit'],
    }),
    twobit: Flags.string({
      char: 't',
      description: '2bit file path or URL',
      exclusive: ['fasta', 'fai', 'gzi'],
    }),
    public: Flags.boolean({
      char: 'p',
      description: 'Make the assembly publicly visible',
      default: false,
    }),
  }

  public async run() {
    const { flags } = await this.parse(AddFromFasta)
    const access = await this.getAccess()

    let sequenceSource
    if (flags.twobit) {
      sequenceSource = { type: 'twobit', twobit: flags.twobit }
    } else if (flags.fasta) {
      sequenceSource = {
        type: 'fasta',
        fa: flags.fasta,
        fai: flags.fai ?? `${flags.fasta}.fai`,
        ...(flags.gzi !== undefined && { gzi: flags.gzi }),
      }
    } else {
      this.error('Provide either --fasta or --twobit')
    }

    const url = new URL(`${access.address}/assemblies`)
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${access.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: flags.assembly,
        sequenceSource,
        ...(flags.public && { visibility: 'public' }),
      }),
      dispatcher: new Agent({ headersTimeout: 60 * 60 * 1000 }),
    })
    if (!response.ok) {
      const errorMessage = await createFetchErrorMessage(
        response,
        'add-from-fasta failed',
      )
      this.error(errorMessage)
    }
    const assembly = (await response.json()) as { _id: string; name: string }
    this.log(JSON.stringify(assembly, null, 2))
  }
}
