import type { CheckResultSnapshot } from '@apollo-annotation/mst'
import { Flags } from '@oclif/core'
import { fetch } from 'undici'

import { BaseCommand } from '../../baseCommand.js'
import {
  convertAssemblyNameToId,
  createFetchErrorMessage,
  idReader,
} from '../../utils.js'

export default class Check extends BaseCommand<typeof Check> {
  static summary = 'Get check results'
  static description =
    'Use this command to view which features fail checks along with the reason for failing.\
Use `apollo assembly check` for managing which checks should be applied to an assembly'

  static examples = [
    {
      description: 'Get all check results in the database:',
      command: '<%= config.bin %> <%= command.id %>',
    },
    {
      description: 'Get check results for assembly hg19:',
      command: '<%= config.bin %> <%= command.id %> -a hg19',
    },
  ]

  static flags = {
    'feature-id': Flags.string({
      char: 'i',
      description: 'Get checks for these feature identifiers',
      multiple: true,
    }),
    assembly: Flags.string({
      char: 'a',
      description: 'Get checks for this assembly',
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Check)

    const access = await this.getAccess()

    let keepFeatures = new Set<string>()
    if (flags['feature-id'] !== undefined) {
      keepFeatures = new Set(await idReader(flags['feature-id']))
    }

    let assemblyId: string | undefined
    if (flags.assembly !== undefined) {
      const ids = await idReader([flags.assembly])
      const assemblyIds = await convertAssemblyNameToId(
        access.address,
        access.accessToken,
        ids,
      )
      if (assemblyIds.length > 0) {
        ;[assemblyId] = assemblyIds
      }
    }

    const checks: CheckResultSnapshot[] = await getChecks(
      access.address,
      access.accessToken,
      assemblyId,
    )
    const results: CheckResultSnapshot[] = []
    for (const chk of checks) {
      let keep = false
      if (flags['feature-id'] === undefined) {
        keep = true
      } else if (
        chk.featureId !== undefined &&
        keepFeatures.has(chk.featureId.toString())
      ) {
        keep = true
      }
      if (keep) {
        results.push(chk)
      }
    }
    results.sort((a, b) => (a.start < b.start ? -1 : 1))
    this.log(JSON.stringify(results, null, 2))
  }
}

async function getChecks(
  address: string,
  token: string,
  assembly?: string,
): Promise<CheckResultSnapshot[]> {
  const url = new URL(`${address}/checks`)
  if (assembly) {
    url.searchParams.set('assembly', assembly)
  }
  const auth = {
    headers: {
      authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  }
  const response = await fetch(url, auth)
  if (!response.ok) {
    const errorMessage = await createFetchErrorMessage(
      response,
      'Failed to access Apollo with the current address and/or access token\nThe server returned:\n',
    )
    throw new Error(errorMessage)
  }
  return (await response.json()) as CheckResultSnapshot[]
}
