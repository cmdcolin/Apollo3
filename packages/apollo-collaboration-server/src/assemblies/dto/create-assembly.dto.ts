import type { SequenceSource } from '@apollo-annotation/common'

export class CreateAssemblyDto {
  readonly name: string
  readonly displayName?: string
  readonly description?: string
  readonly aliases?: string[]
  readonly checks?: string[]
  readonly organism?: string
  readonly sequenceSource?: SequenceSource
  readonly visibility?: 'public' | 'private'
}
