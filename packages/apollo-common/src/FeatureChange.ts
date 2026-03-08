import {
  AssemblySpecificChange,
  type SerializedAssemblySpecificChange,
  isAssemblySpecificChange,
} from './AssemblySpecificChange'
import { type ChangeOptions } from './Change'

export interface SerializedFeatureChange
  extends SerializedAssemblySpecificChange {
  /** The IDs of features that were changed in this operation */
  changedIds: string[]
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isFeatureChange(thing: any): thing is FeatureChange {
  return (
    isAssemblySpecificChange(thing) &&
    (thing as FeatureChange).changedIds !== undefined
  )
}

export abstract class FeatureChange extends AssemblySpecificChange {
  changedIds: string[]

  constructor(json: SerializedFeatureChange, options?: ChangeOptions) {
    super(json, options)
    this.changedIds = json.changedIds
  }
}
