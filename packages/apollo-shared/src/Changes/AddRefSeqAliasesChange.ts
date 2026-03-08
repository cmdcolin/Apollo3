import {
  AssemblySpecificChange,
  type Change,
  type ChangeOptions,
  type ClientDataStore,
  type SerializedAssemblySpecificChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import { getSession } from '@jbrowse/core/util'

export interface SerializedRefSeqAliases {
  refName: string
  aliases: string[]
}

export interface SerializedRefSeqAliasesChange
  extends SerializedAssemblySpecificChange {
  typeName: 'AddRefSeqAliasesChange'
  refSeqAliases: SerializedRefSeqAliases[]
}

export class AddRefSeqAliasesChange extends AssemblySpecificChange {
  typeName = 'AddRefSeqAliasesChange' as const
  refSeqAliases: SerializedRefSeqAliases[]

  constructor(json: SerializedRefSeqAliasesChange, options?: ChangeOptions) {
    super(json, options)
    this.refSeqAliases = json.refSeqAliases
  }

  executeOnClient(clientDataStore: ClientDataStore) {
    const { assemblyManager } = getSession(clientDataStore)
    const assembly = assemblyManager.get(this.assembly)
    if (!assembly) {
      throw new Error(`assembly ${this.assembly} not found`)
    }
    const sessionAliases = assembly.refNameAliases ?? {}

    for (const refSeqAlias of this.refSeqAliases) {
      const { aliases, refName } = refSeqAlias
      for (const alias of aliases) {
        sessionAliases[alias] = refName
      }
    }
    assembly.setRefNameAliases(sessionAliases)
    return Promise.resolve()
  }

  getInverse(): Change {
    throw new Error('Method not implemented.')
  }

  toJSON(): SerializedRefSeqAliasesChange {
    const { assembly, refSeqAliases, typeName } = this
    return { assembly, typeName, refSeqAliases }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { assembly, refSeqAliases } = this
    for (const { aliases, refName } of refSeqAliases) {
      const refSeq = await backend.refSeqRepository.findByNameAndAssembly(
        refName,
        assembly,
      )
      if (refSeq) {
        await backend.refSeqRepository.updateById(refSeq._id, { aliases })
      }
    }
  }
  // eslint-disable-next-line @typescript-eslint/class-literal-property-style
  get notification(): string {
    return 'RefSeq aliases have been added.'
  }
}
