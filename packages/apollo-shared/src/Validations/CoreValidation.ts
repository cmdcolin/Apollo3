/* eslint-disable @typescript-eslint/require-await */
import { Validation } from '@apollo-annotation/common'

import soSequenceTypes from './soSequenceTypes.js'

export class CoreValidation extends Validation {
  name = 'Core' as const

  async possibleValues(key: string): Promise<string[] | undefined> {
    if (key === 'type') {
      return soSequenceTypes
    }
    return
  }
}
