import type { SerializedChange } from '@apollo-annotation/common'

export const COMMON_CHANNEL = 'COMMON'

interface BaseMessage {
  channel: string
  userName: string
  userSessionId: string
}

export interface ChangeMessage extends BaseMessage {
  changeInfo: SerializedChange
  changeSequence: number
}
