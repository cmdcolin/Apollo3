import type { SerializedChange } from '@apollo-annotation/common'
import type { CheckResultSnapshot } from '@apollo-annotation/mst'

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
export interface CheckResultUpdate extends BaseMessage {
  checkResult: CheckResultSnapshot
  deleted?: boolean
}
