import { Flags } from '@oclif/core'
import { type Response, fetch } from 'undici'

import { BaseCommand } from '../../baseCommand.js'
import { createFetchErrorMessage } from '../../utils.js'

export default class Get extends BaseCommand<typeof Get> {
  static description =
    'Get features in assembly, reference sequence or genomic window'

  static examples = [
    {
      description: 'Get all features in myAssembly:',
      command: '<%= config.bin %> <%= command.id %> -a myAssembly',
    },
    {
      description: 'Get features intersecting chr1:1..1000:',
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
      description: 'Reference sequence name. If unset, query all sequences',
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
    const { flags } = await this.parse(Get)

    const endCoord: number = flags.end ?? Number.MAX_SAFE_INTEGER
    if (flags.start <= 0 || endCoord <= 0) {
      this.error('Start and end coordinates must be greater than 0.')
    }

    const access = await this.getAccess()

    if (flags.refseq) {
      const features: Response = await this.getFeatures(
        access.address,
        access.accessToken,
        flags.assembly,
        flags.refseq,
        flags.start,
        endCoord,
      )
      const json = (await features.json()) as object[]
      const results: object[] = []
      for (const x of json[0] as object[]) {
        results.push(x)
      }
      this.log(JSON.stringify(results, null, 2))
    } else {
      this.error(
        'A reference sequence name (--refseq) is required to fetch features',
      )
    }
  }

  private async getFeatures(
    address: string,
    token: string,
    assembly: string,
    refSeq: string,
    start: number,
    end: number,
  ): Promise<Response> {
    const url = new URL(`${address}/features/getFeatures`)
    const searchParams = new URLSearchParams({
      assembly,
      refSeq,
      start: start.toString(),
      end: end.toString(),
    })
    url.search = searchParams.toString()
    const auth = {
      headers: {
        authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    }
    const res = await fetch(url, auth)
    if (!res.ok) {
      const errorMessage = await createFetchErrorMessage(
        res,
        'Failed to access Apollo with the current address and/or access token\nThe server returned:\n',
      )
      throw new Error(errorMessage)
    }
    return res
  }
}
