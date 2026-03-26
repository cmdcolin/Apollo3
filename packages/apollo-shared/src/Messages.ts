import type { NestedFeature, SerializedChange } from '@apollo-annotation/common'

export const COMMON_CHANNEL = 'COMMON'

export function assemblyChannel(assemblyId: string) {
  return `assembly:${assemblyId}`
}

interface BaseMessage {
  channel: string
  userName: string
  userSessionId: string
}

export interface ChangeMessage extends BaseMessage {
  changeInfo: SerializedChange
  changeSequence: number
  assemblyId?: string
}

export interface FeatureUpdateMessage extends BaseMessage {
  changeSequence: number
  assemblyId: string
  features: NestedFeature[]
  deletedFeatureIds: string[]
}
