import { Flags } from '@oclif/core'
import { Agent, type RequestInit, type Response, fetch } from 'undici'

import { BaseCommand } from '../../baseCommand.js'
import { createFetchErrorMessage } from '../../utils.js'

async function getSequence(
  address: string,
  accessToken: string,
  assembly: string,
  refSeq: string,
  start: number,
  end: number,
): Promise<Response> {
  const url = new URL(`${address}/sequence`)
  const searchParams = new URLSearchParams({
    assembly,
    refSeq,
    start: start.toString(),
    end: end.toString(),
  })
  url.search = searchParams.toString()

  const auth: RequestInit = {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    dispatcher: new Agent({ headersTimeout: 60 * 60 * 1000 }),
  }
  const response = await fetch(url.toString(), auth)
  if (!response.ok) {
    const errorMessage = await createFetchErrorMessage(
      response,
      'getSequence failed',
    )
    throw new Error(errorMessage)
  }
  return response
}

export default class ApolloCmd extends BaseCommand<typeof ApolloCmd> {
  static summary = 'Get reference sequence in fasta format'
  static description =
    'Return the reference sequence for a given assembly and coordinates'

  static examples = [
    {
      description: 'Get all sequences in myAssembly:',
      command: '<%= config.bin %> <%= command.id %> -a myAssembly',
    },
    {
      description: 'Get sequence in coordinates chr1:1..1000:',
      command:
        '<%= config.bin %> <%= command.id %> -a myAssembly -r chr1 -s 1 -e 1000',
    },
  ]

  static flags = {
    assembly: Flags.string({
      char: 'a',
      description: 'Assembly name',
      required: true,
    }),
    refseq: Flags.string({
      char: 'r',
      description: 'Reference sequence name',
      required: true,
    }),
    start: Flags.integer({
      char: 's',
      description: 'Start coordinate (1-based)',
      default: 1,
    }),
    end: Flags.integer({
      char: 'e',
      description: 'End coordinate',
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(ApolloCmd)

    const endCoord: number = flags.end ?? Number.MAX_SAFE_INTEGER
    if (flags.start <= 0 || endCoord <= 0) {
      this.error('Start and end coordinates must be greater than 0.')
    }

    const access = await this.getAccess()

    const res = await getSequence(
      access.address,
      access.accessToken,
      flags.assembly,
      flags.refseq,
      flags.start - 1,
      endCoord,
    )

    const seq = await res.text()
    const header = `>${flags.refseq}:${flags.start}..${flags.start + seq.length - 1}`
    this.log(header)
    this.log(splitStringIntoChunks(seq, 80).join('\n'))
  }
}

function splitStringIntoChunks(input: string, chunkSize: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < input.length; i += chunkSize) {
    const chunk = input.slice(i, i + chunkSize)
    chunks.push(chunk)
  }
  return chunks
}
