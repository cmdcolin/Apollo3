/* eslint-disable @typescript-eslint/require-await */
import type { ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'

import type { Change, ClientDataStore } from './Change.js'

export interface Context {
  context: ExecutionContext
  reflector: Reflector
}

export function isContext(thing: Change | Context): thing is Context {
  return 'context' in thing && 'reflector' in thing
}

export interface ValidationResult {
  validationName: string
  error?: { message: string }
}

export abstract class Validation {
  abstract name: string
  async frontendPreValidate(_change: Change): Promise<ValidationResult> {
    return { validationName: this.name }
  }

  async frontendPostValidate(
    _change: Change,
    _dataStore: ClientDataStore,
  ): Promise<ValidationResult> {
    return { validationName: this.name }
  }

  async backendPreValidate(
    _changeOrContext: Change | Context,
  ): Promise<ValidationResult> {
    return { validationName: this.name }
  }

  async possibleValues(_key: string): Promise<unknown[] | undefined> {
    return undefined
  }
}
