import { AsyncLocalStorage } from 'node:async_hooks'

interface MutationContextData {
  sequence: number
  user: string
}

export const mutationContext = new AsyncLocalStorage<MutationContextData>()
