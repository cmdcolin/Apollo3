import * as fs from 'node:fs'

import { Args, Flags } from '@oclif/core'
import { Agent, type RequestInit, type Response, fetch } from 'undici'

import { ConfigError } from '../../ApolloConf.js'
import { BaseCommand } from '../../baseCommand.js'
import { createFetchErrorMessage, queryApollo } from '../../utils.js'

interface RefSeqRow {
  _id: string
  name: string
  assembly: string
}

export default class AddRefNameAlias extends BaseCommand<
  typeof AddRefNameAlias
> {
  static summary = 'Add reference name aliases from a file'
  static description =
    'Reference name aliasing is a process to make chromosomes that are named slightly differently but which refer to the same thing render properly. This command reads a file with reference name aliases and adds them to the database.'

  static examples = [
    {
      description: 'Add reference name aliases:',
      command: '<%= config.bin %> <%= command.id %> alias.txt -a myAssembly',
    },
  ]

  static args = {
    'input-file': Args.string({
      description: 'Input refname alias file',
      required: true,
    }),
  }

  static flags = {
    assembly: Flags.string({
      char: 'a',
      description: 'Name for this assembly.',
      required: true,
    }),
  }

  async run(): Promise<void> {
    const { args, flags } = await this.parse(AddRefNameAlias)

    if (!fs.existsSync(args['input-file'])) {
      this.error(`File ${args['input-file']} does not exist`)
    }

    const access = await this.getAccess()
    const filehandle = await fs.promises.open(args['input-file'])
    const fileContent = await filehandle.readFile({ encoding: 'utf8' })
    await filehandle.close()
    const lines = fileContent
      .split('\n')
      .filter((line) => line.trim().length > 0)

    const aliasesByRefName = new Map<string, string[]>()
    for (const line of lines) {
      const [refName, ...aliases] = line.split('\t')
      aliasesByRefName.set(refName, aliases)
    }

    const assemblies: Response = await queryApollo(
      access.address,
      access.accessToken,
      'assemblies',
    )
    const json = (await assemblies.json()) as { _id: string; name: string }[]
    const assembly = json.find((x) => x.name === flags.assembly)

    if (!assembly) {
      this.error(`Assembly ${flags.assembly} not found`)
    }

    const refSeqsRes: Response = await queryApollo(
      access.address,
      access.accessToken,
      `refSeqs?assembly=${assembly._id}`,
    )
    const refSeqs = (await refSeqsRes.json()) as RefSeqRow[]

    let updated = 0
    for (const refSeq of refSeqs) {
      const aliases = aliasesByRefName.get(refSeq.name)
      if (aliases) {
        const url = new URL(`${access.address}/refSeqs/${refSeq._id}`)
        const auth: RequestInit = {
          method: 'PATCH',
          body: JSON.stringify({ aliases }),
          headers: {
            Authorization: `Bearer ${access.accessToken}`,
            'Content-Type': 'application/json',
          },
          dispatcher: new Agent({ headersTimeout: 60 * 60 * 1000 }),
        }
        const response = await fetch(url, auth)
        if (!response.ok) {
          const errorMessage = await createFetchErrorMessage(
            response,
            `Failed to add aliases for refSeq "${refSeq.name}"`,
          )
          throw new ConfigError(errorMessage)
        }
        updated++
      }
    }
    this.log(
      `Reference name aliases added successfully to ${updated} sequences in assembly ${flags.assembly}`,
    )
  }
}
