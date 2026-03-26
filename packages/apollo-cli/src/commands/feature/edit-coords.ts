import type { AnnotationFeatureSnapshot } from '@apollo-annotation/mst'
import { Flags } from '@oclif/core'
import { type Response, fetch } from 'undici'

import { BaseCommand } from '../../baseCommand.js'
import {
  createFetchErrorMessage,
  getFeatureById,
  idReader,
} from '../../utils.js'

export default class Get extends BaseCommand<typeof Get> {
  static summary = 'Edit feature start and/or end coordinates'
  static description =
    "If editing a child feature that new coordinates must be within the parent's coordinates.\
To get the identifier of the feature to edit consider using `apollo feature get` or `apollo feature search`"

  static examples = [
    {
      description: 'Edit start and end:',
      command: '<%= config.bin %> <%= command.id %> -i abc...xyz -s 10 -e 1000',
    },
    {
      description: 'Edit end and leave start as it is:',
      command: '<%= config.bin %> <%= command.id %> -i abc...xyz -e 2000',
    },
  ]

  static flags = {
    'feature-id': Flags.string({
      char: 'i',
      default: '-',
      description: 'Feature ID to edit or "-" to read it from stdin',
    }),
    start: Flags.integer({
      char: 's',
      description: 'New start coordinate (1-based)',
    }),
    end: Flags.integer({
      char: 'e',
      description: 'New end coordinate (1-based)',
    }),
  }

  public async run(): Promise<void> {
    const { flags } = await this.parse(Get)

    if (flags.start === undefined && flags.end === undefined) {
      this.error('Please provide new start and/or end coordinates to edit')
    }

    if (flags.start !== undefined && flags.start <= 0) {
      this.error('Coordinates must be greater than 0')
    }

    if (
      flags.start !== undefined &&
      flags.end !== undefined &&
      flags.end < flags.start
    ) {
      this.error(
        'Error: The new end coordinate is lower than the new start coordinate',
      )
    }

    if (flags.start !== undefined) {
      flags.start -= 1
    }

    const ff = await idReader([flags['feature-id']])
    if (ff.length !== 1) {
      this.error(`Expected only one feature identifier. Got ${ff.length}`)
    }
    const [featureId] = ff

    const access = await this.getAccess()

    const res: Response = await getFeatureById(
      access.address,
      access.accessToken,
      featureId,
    )
    if (!res.ok) {
      const errorMessage = await createFetchErrorMessage(
        res,
        'getFeatureById failed',
      )
      throw new Error(errorMessage)
    }
    const featureJson = JSON.parse(
      await res.text(),
    ) as AnnotationFeatureSnapshot

    const patch: { min?: number; max?: number } = {}
    if (flags.start !== undefined && flags.start !== featureJson.min) {
      patch.min = flags.start
    }
    if (flags.end !== undefined && flags.end !== featureJson.max) {
      patch.max = flags.end
    }
    if (Object.keys(patch).length > 0) {
      const url = new URL(`${access.address}/features/${featureId}`)
      const auth = {
        method: 'PATCH',
        body: JSON.stringify(patch),
        headers: {
          authorization: `Bearer ${access.accessToken}`,
          'Content-Type': 'application/json',
        },
      }
      const response = await fetch(url, auth)
      if (!response.ok) {
        const errorMessage = await createFetchErrorMessage(
          response,
          'edit-coords failed',
        )
        throw new Error(errorMessage)
      }
    }
  }
}
