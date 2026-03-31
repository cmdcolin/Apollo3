import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'
import { Flags } from '@oclif/core'
import { ObjectId } from 'bson'
import { type Response, fetch } from 'undici'

import { BaseCommand } from '../../baseCommand.js'
import {
  convertAssemblyNameToId,
  createFetchErrorMessage,
  getFeatureById,
} from '../../utils.js'

export default class Copy extends BaseCommand<typeof Copy> {
  static summary = 'Copy a feature to another location'
  static description =
    'The feature may be copied to the same or to a different assembly. \
The destination reference sequence is selected by name.'

  static examples = [
    {
      description: 'Copy this feature ID to chr1:100 in assembly hg38:',
      command:
        '<%= config.bin %> <%= command.id %> -i 6605826fbd0eee691f83e73f -r chr1 -s 100 -a hg38',
    },
  ]

  static flags = {
    'feature-id': Flags.string({
      char: 'i',
      default: '-',
      description: 'Feature ID to copy to; use - to read it from stdin',
    }),
    refseq: Flags.string({
      char: 'r',
      description: 'Name of target reference sequence',
      required: true,
    }),
    start: Flags.integer({
      char: 's',
      description: 'Start position in target reference sequence',
      required: true,
    }),
    assembly: Flags.string({
      char: 'a',
      description: 'Name or ID of target assembly',
      required: true,
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Copy)

    if (flags.start <= 0) {
      this.error('Start coordinate must be greater than 0')
    }

    const access = await this.getAccess()

    const res: Response = await getFeatureById(
      access.address,
      access.accessToken,
      flags['feature-id'],
    )
    if (!res.ok) {
      const errorMessage = await createFetchErrorMessage(
        res,
        'getFeatureById failed',
      )
      throw new Error(errorMessage)
    }
    const feature: AnnotationFeatureSnapshot =
      (await res.json()) as AnnotationFeatureSnapshot

    const assemblyIds = await convertAssemblyNameToId(
      access.address,
      access.accessToken,
      [flags.assembly],
    )
    if (assemblyIds.length === 0) {
      this.error(`Assembly "${flags.assembly}" not found`)
    }
    const [assemblyId] = assemblyIds

    const newId = new ObjectId().toHexString()
    const rescopy = await this.copyFeature(
      access.address,
      access.accessToken,
      feature,
      flags.refseq,
      flags.start,
      assemblyId,
      newId,
    )
    if (!rescopy.ok) {
      const errorMessage = await createFetchErrorMessage(
        rescopy,
        'Copy feature failed',
      )
      throw new Error(errorMessage)
    }
  }

  private async copyFeature(
    address: string,
    accessToken: string,
    feature: AnnotationFeatureSnapshot,
    refseq: string,
    min: number,
    assemblyId: string,
    newId: string,
  ): Promise<Response> {
    const featureLen = feature.max - feature.min

    const addedFeature: AnnotationFeatureSnapshot = {
      _id: newId,
      refSeq: refseq,
      min: min - 1,
      max: min + featureLen - 1,
      type: feature.type,
      attributes: feature.attributes,
      strand: feature.strand,
    }
    const url = new URL(`${address}/features`)
    const auth = {
      method: 'POST',
      body: JSON.stringify({ addedFeature, assemblyId }),
      headers: {
        authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
    const res = await fetch(url, auth)
    if (!res.ok) {
      const errorMessage = await createFetchErrorMessage(
        res,
        'copyFeature failed',
      )
      throw new Error(errorMessage)
    }
    return res
  }
}
