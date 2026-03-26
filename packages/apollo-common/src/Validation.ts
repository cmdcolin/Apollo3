/* eslint-disable @typescript-eslint/require-await */
import type { ExecutionContext } from '@nestjs/common'
import type { Reflector } from '@nestjs/core'

import type { ClientDataStore } from './Operation.js'

export interface Context {
  context: ExecutionContext
  reflector: Reflector
}

export interface ValidationResult {
  validationName: string
  error?: { message: string }
}

export abstract class Validation {
  abstract name: string

  async frontendPostValidate(
    _dataStore: ClientDataStore,
  ): Promise<ValidationResult> {
    return { validationName: this.name }
  }

  async backendPreValidate(_context: Context): Promise<ValidationResult> {
    return { validationName: this.name }
  }

  async possibleValues(_key: string): Promise<unknown[] | undefined> {
    return undefined
  }
}
