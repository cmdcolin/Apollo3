/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-call */
import {
  AssemblySpecificChange,
  type ClientDataStore,
  type SerializedAssemblySpecificChange,
  type ServerDataStore,
} from '@apollo-annotation/common'
import { getSession } from '@jbrowse/core/util'

export interface SerializedDeleteAssemblyChange extends SerializedAssemblySpecificChange {
  typeName: 'DeleteAssemblyChange'
}
export class DeleteAssemblyChange extends AssemblySpecificChange {
  typeName = 'DeleteAssemblyChange' as const

  get notification(): string {
    return `Assembly "${this.assembly}" deleted successfully.`
  }

  toJSON(): SerializedDeleteAssemblyChange {
    const { assembly, typeName } = this
    return { typeName, assembly }
  }

  async executeOnServer(backend: ServerDataStore) {
    const { assembly, logger } = this
    const assemblyRow = await backend.assemblyRepository.findById(assembly)
    if (!assemblyRow) {
      const errMsg = `Assembly with id "${assembly}" not found`
      logger.error(errMsg)
      throw new Error(errMsg)
    }
    await backend.assemblyRepository.deleteById(assembly)
    logger.debug?.(`Assembly "${assembly}" deleted.`)
  }
  async executeOnClient(dataStore: ClientDataStore) {
    const { assembly } = this
    if (!dataStore) {
      throw new Error('No data store')
    }
    const session = getSession(dataStore)
    // If assemblyId is not present in client data store
    if (dataStore.assemblies.has(assembly)) {
      dataStore.deleteAssembly(assembly)
    }
    await session.removeAssembly?.(assembly)
    // @ts-expect-error this isn't on the AbstractSessionModel
    await session.removeSessionAssembly?.(assembly)
  }

  getInverse() {
    const { assembly, logger } = this
    return new DeleteAssemblyChange(
      { typeName: 'DeleteAssemblyChange', assembly },
      { logger },
    )
  }
}
