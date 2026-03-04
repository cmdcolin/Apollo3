/* eslint-disable @typescript-eslint/require-await */
import {
  type LocalGFF3DataStore,
  Operation,
  type SerializedOperation,
  type ServerDataStore,
  type ServerDataStoreV2,
} from '@apollo-annotation/common'

interface SerializedGetAssembliesOperation extends SerializedOperation {
  typeName: 'GetAssembliesOperation'
}

export class GetAssembliesOperation extends Operation {
  typeName = 'GetAssembliesOperation' as const

  toJSON(): SerializedGetAssembliesOperation {
    const { typeName } = this
    return { typeName }
  }

  executeOnServer(backend: ServerDataStore) {
    return backend.assemblyModel.find({ status: 0 }).exec()
  }

  async executeOnServerV2(backend: ServerDataStoreV2) {
    const rows = await backend.assemblyRepository.findAll()
    return rows.filter((r) => r.status === 0)
  }

  async executeOnLocalGFF3(_backend: LocalGFF3DataStore) {
    throw new Error('executeOnLocalGFF3 not implemented')
  }
}
