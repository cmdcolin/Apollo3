import type {
  ClientDataStore,
  Context,
  Validation,
  ValidationResult,
} from '@apollo-annotation/common'

export class ValidationResultSet {
  results: ValidationResult[] = []
  get resultsMessages() {
    return this.results
      .map((r) => r.error?.message)
      .filter(Boolean)
      .join(', ')
  }

  ok = true
  add(result: ValidationResult) {
    this.results.push(result)
    if (result.error) {
      this.ok = false
    }
  }
}

export class ValidationSet {
  validations = new Set<Validation>()

  registerValidation(validation: Validation): void {
    this.validations.add(validation)
  }

  async frontendPostValidate(
    dataStore: ClientDataStore,
  ): Promise<ValidationResultSet> {
    const results = new ValidationResultSet()
    for (const v of this.validations) {
      const result = await v.frontendPostValidate(dataStore)
      results.add(result)
      if (result.error) {
        break
      }
    }
    return results
  }

  async backendPreValidate(context: Context): Promise<ValidationResultSet> {
    const results = new ValidationResultSet()
    for (const v of this.validations) {
      const result = await v.backendPreValidate(context)
      results.add(result)
      if (result.error) {
        break
      }
    }
    return results
  }

  async possibleValues(key: string) {
    for (const v of this.validations) {
      const vals = await v.possibleValues(key)
      if (vals) {
        return vals
      }
    }
    return
  }
}

/** global singleton of all known validations */
export const validationRegistry = new ValidationSet()
